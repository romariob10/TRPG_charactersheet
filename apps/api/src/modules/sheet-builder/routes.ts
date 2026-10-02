import type { FastifyInstance } from "fastify";
import {
  autosaveSheetDraftRequestSchema,
  importSheetRequestSchema,
  MAX_SHEET_TRANSFER_BYTES,
  createSheetDefinitionRequestSchema,
  publishSheetVersionRequestSchema,
} from "@mycharacter/contracts";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { SheetBuilderService } from "./service.js";
import { z } from "zod";

const idParamsSchema = z.object({ id: z.string().uuid() });
const versionParamsSchema = z.object({ versionId: z.string().uuid() });

function parseParams<T>(schema: z.ZodType<T>, params: unknown): T {
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", 400, "Invalid route parameters.");
  return parsed.data;
}

export async function registerSheetBuilderRoutes(
  app: FastifyInstance,
): Promise<void> {
  const service = new SheetBuilderService(app.db);

  app.post("/api/sheet-definitions", async (request, reply) => {
    const actor = requireActor(request);
    const parsed = createSheetDefinitionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid sheet definition payload.");
    }
    const created = await service.createSheetDefinition(actor.userId, parsed.data);
    return reply.status(201).send(created);
  });

  app.get("/api/sheet-definitions/:id/editor", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    const { id } = parseParams(idParamsSchema, request.params);
    return service.getSheetEditorData(actor.userId, id);
  });

  app.put("/api/sheet-definitions/:id/draft", { bodyLimit: MAX_SHEET_TRANSFER_BYTES + 1024 }, async (request) => {
    const actor = requireActor(request);
    const { id } = parseParams(idParamsSchema, request.params);
    const parsed = autosaveSheetDraftRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid sheet draft payload.");
    }
    return service.autosaveSheetDraft(actor.userId, id, parsed.data);
  });

  app.get("/api/sheet-definitions/:id/export", async (request, reply) => {
    const actor = requireActor(request);
    const { id } = parseParams(idParamsSchema, request.params);
    reply.header("Cache-Control", "private, no-store");
    reply.header("Content-Disposition", 'attachment; filename="character-sheet.json"');
    return service.exportSheet(actor.userId, id);
  });

  app.post("/api/sheet-definitions/:id/import", { bodyLimit: MAX_SHEET_TRANSFER_BYTES + 1024 }, async (request) => {
    const actor = requireActor(request);
    const { id } = parseParams(idParamsSchema, request.params);
    const parsed = importSheetRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError("INVALID_SHEET_IMPORT", 400, "Invalid portable sheet document.");
    return service.autosaveSheetDraft(actor.userId, id, {
      expectedRevision: parsed.data.expectedRevision,
      layouts: parsed.data.document.layouts,
      fields: parsed.data.document.fields,
    });
  });

  app.post("/api/sheet-definitions/:id/publish", async (request, reply) => {
    const actor = requireActor(request);
    const { id } = parseParams(idParamsSchema, request.params);
    const parsed = publishSheetVersionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid publish request payload.");
    }
    const result = await service.publishSheetVersion(actor.userId, id, parsed.data);
    return reply.status(200).send(result);
  });

  app.get("/api/sheet-definitions/:id/versions", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    const { id } = parseParams(idParamsSchema, request.params);
    return service.listSheetVersions(actor.userId, id);
  });

  app.get("/api/sheet-versions/:versionId", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    const { versionId } = parseParams(versionParamsSchema, request.params);
    return service.getSheetVersion(actor.userId, versionId);
  });
}
