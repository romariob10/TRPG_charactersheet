import { createHash } from "node:crypto";
import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance, FastifyReply } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { CharacterService } from "../characters/service.js";
import { TemplateService } from "../templates/service.js";
import { PdfUploadService, type TemplateUpload } from "./upload-service.js";

export async function registerPdfRoutes(app: FastifyInstance): Promise<void> {
  const uploadService = new PdfUploadService(app.db, app.storage, app.jobs);
  const templateService = new TemplateService(app.db);
  const characterService = new CharacterService(app.db);
  app.post("/api/templates", async (request, reply) => {
    const actor = requireActor(request);
    const input = await parseTemplateUpload(request.parts());
    let result;
    try {
      result = await uploadService.uploadTemplate(actor.userId, input);
    } catch (error) {
      if (!(error instanceof AppError)) {
        request.log.error(
          {
            err: error,
            actorId: actor.userId,
            stage: "template-upload",
            pdfBytes: input.bytes.byteLength,
            sha256: createHash("sha256").update(input.bytes).digest("hex"),
          },
          "Unexpected template upload failure",
        );
      }
      throw error;
    }
    if (result.kind === "community") {
      return reply.status(409).send({
        error: {
          code: "COMMUNITY_TEMPLATE_DUPLICATE",
          message: "A community mapping already exists for this PDF.",
          requestId: request.id,
        },
        duplicateCommunity: result.duplicateCommunity,
      });
    }
    return reply
      .status(result.kind === "created" ? 201 : 200)
      .send({
        templateId: result.templateId,
        existing: result.kind === "existing",
        restored: result.kind === "restored",
      });
  });

  app.get("/api/templates/:id/pdf", async (request, reply) => {
    const actor = requireActor(request);
    const templateId = parseId(request.params);
    try {
      await templateService.get(actor.userId, templateId);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) throw pdfNotFound();
      throw error;
    }
    const file = await app.db
      .selectFrom("pdf_templates as template")
      .innerJoin("object_files as file", "file.id", "template.file_id")
      .select(["file.storage_key as storageKey"])
      .where("template.id", "=", templateId)
      .where("file.state", "=", "ready")
      .executeTakeFirst();
    if (!file) throw pdfNotFound();
    return sendPdf(app, reply, file.storageKey, request.headers.range);
  });

  app.get("/api/characters/:id/pdf", async (request, reply) => {
    const actor = requireActor(request);
    let row;
    try {
      row = await characterService.authorizeCharacter(
        actor.userId,
        parseId(request.params),
        "read",
      );
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) throw pdfNotFound();
      throw error;
    }
    const file = await app.db
      .selectFrom("pdf_templates as template")
      .innerJoin("object_files as file", "file.id", "template.file_id")
      .select("file.storage_key as storageKey")
      .where("template.id", "=", row.templateId)
      .where("file.state", "=", "ready")
      .executeTakeFirst();
    if (!file) throw pdfNotFound();
    return sendPdf(app, reply, file.storageKey, request.headers.range);
  });
}

async function parseTemplateUpload(
  parts: AsyncIterableIterator<MultipartFile | import("@fastify/multipart").MultipartValue>,
): Promise<TemplateUpload> {
  const fields = new Map<string, string>();
  let bytes: Uint8Array | undefined;
  try {
    for await (const part of parts) {
      if (part.type === "file") {
        if (bytes) throw new AppError("VALIDATION_FAILED", 400, "Only one PDF is allowed.");
        bytes = await part.toBuffer();
      } else {
        fields.set(part.fieldname, String(part.value));
      }
    }
  } catch (error) {
    if (nodeCode(error) === "FST_REQ_FILE_TOO_LARGE") {
      throw new AppError("PDF_TOO_LARGE", 413, "PDF is larger than 25 MB.");
    }
    throw error;
  }
  if (!bytes) throw new AppError("VALIDATION_FAILED", 400, "A PDF file is required.");
  return {
    bytes,
    title: (fields.get("title") ?? "").trim(),
    gameSystem: (fields.get("gameSystem") ?? "").trim(),
    allowVision: fields.get("allowVision") === "true",
    isPublic: fields.get("publishCommunity") === "true",
    forceDuplicate: fields.get("forceDuplicate") === "true",
  };
}

async function sendPdf(
  app: FastifyInstance,
  reply: FastifyReply,
  storageKey: string,
  rangeHeader: string | undefined,
) {
  let metadata;
  try {
    metadata = await app.storage.stat(storageKey);
  } catch {
    throw pdfNotFound();
  }
  const range = parseRange(rangeHeader, metadata.size);
  if (range === null) {
    return reply
      .status(416)
      .header("content-range", `bytes */${metadata.size}`)
      .send();
  }
  let opened;
  try {
    opened = await app.storage.open(storageKey, range ?? {});
  } catch {
    throw pdfNotFound();
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? metadata.size - 1;
  reply
    .status(range ? 206 : 200)
    .header("accept-ranges", "bytes")
    .header("cache-control", "private, no-store")
    .header("content-type", "application/pdf")
    .header("content-length", String(end - start + 1));
  if (range) reply.header("content-range", `bytes ${start}-${end}/${metadata.size}`);
  return reply.send(opened.stream);
}

function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | undefined | null {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size < 1) return null;
  if (!match[1] && !match[2]) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      start >= size
    ) {
      return null;
    }
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function parseId(params: unknown): string {
  const id = (params as { id?: unknown }).id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) {
    throw new AppError("VALIDATION_FAILED", 400, "Resource ID is invalid.");
  }
  return id;
}

function pdfNotFound(): AppError {
  return new AppError("PDF_NOT_FOUND", 404, "PDF not found.");
}

function nodeCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}
