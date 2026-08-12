import { createHash, randomUUID } from "node:crypto";
import {
  PDFDict,
  PDFDocument,
  PDFName,
} from "pdf-lib";
import type { Database } from "@mycharacter/database";
import {
  StorageError,
  type ObjectStorage,
} from "@mycharacter/storage";
import type { Kysely } from "kysely";
import { AppError } from "../../errors.js";
import type { JobClient } from "../../jobs/client.js";
import { slugCandidate, slugifyTemplateTitle } from "../templates/slug.js";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 20;
const MAX_SLUG_RACE_ATTEMPTS = 5;
const MAX_SLUG_SUFFIX = 100_000;
const SLUG_CONSTRAINT = "pdf_templates_owner_slug_idx";
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface TemplateUpload {
  allowVision: boolean;
  bytes: Uint8Array;
  forceDuplicate: boolean;
  gameSystem: string;
  isPublic: boolean;
  title: string;
}

export interface DuplicateCommunityTemplate {
  id: string;
  title: string;
  gameSystem: string | null;
  pageCount: number;
  subscribed: boolean;
}

export type TemplateUploadResult =
  | { kind: "created"; templateId: string }
  | { kind: "existing"; templateId: string }
  | { kind: "restored"; templateId: string }
  | { kind: "community"; duplicateCommunity: DuplicateCommunityTemplate };

export class PdfUploadService {
  private readonly db: Kysely<Database>;
  private readonly storage: ObjectStorage;
  private readonly jobs: JobClient;

  public constructor(
    database: Kysely<Database>,
    storage: ObjectStorage,
    jobs: JobClient,
  ) {
    this.db = database;
    this.storage = storage;
    this.jobs = jobs;
  }

  async uploadTemplate(
    actorId: string,
    input: TemplateUpload,
  ): Promise<TemplateUploadResult> {
    validateMetadata(input);
    const pdf = await validatePdf(input.bytes);
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const existing = await this.findActiveDuplicate(actorId, sha256);
    if (existing) {
      return { kind: "existing", templateId: existing.id };
    }

    const restoredId = await this.restoreTrashedDuplicate(actorId, sha256, input);
    if (restoredId) {
      return { kind: "restored", templateId: restoredId };
    }

    if (!input.forceDuplicate) {
      const community = await this.db
        .selectFrom("pdf_templates as template")
        .leftJoin("template_subscriptions as subscription", (join) =>
          join
            .onRef("subscription.template_id", "=", "template.id")
            .on("subscription.user_id", "=", actorId),
        )
        .select([
          "template.id",
          "template.title",
          "template.game_system as gameSystem",
          "template.page_count as pageCount",
          "subscription.user_id as subscriberId",
        ])
        .where("template.owner_id", "!=", actorId)
        .where("template.visibility", "=", "private")
        .where("template.is_public", "=", true)
        .where("template.sha256", "=", sha256)
        .where("template.deleted_at", "is", null)
        .where("template.catalog_approved_at", "is not", null)
        .where("template.catalog_status", "in", ["ready", "partial"])
        .executeTakeFirst();
      if (community) {
        return {
          kind: "community",
          duplicateCommunity: {
            id: community.id,
            title: community.title,
            gameSystem: community.gameSystem,
            pageCount: community.pageCount,
            subscribed: community.subscriberId !== null,
          },
        };
      }
    }

    const templateId = randomUUID();
    const fileId = randomUUID();
    const storageKey = `templates/${templateId.slice(0, 2)}/${actorId}/${templateId}.pdf`;
    await this.db
      .insertInto("object_files")
      .values({
        id: fileId,
        storage_key: storageKey,
        sha256,
        size_bytes: String(input.bytes.byteLength),
        media_type: "application/pdf",
        state: "pending",
      })
      .execute();
    try {
      await this.storage.put(storageKey, input.bytes);
    } catch (error) {
      await this.db.deleteFrom("object_files").where("id", "=", fileId).execute();
      throw storageAppError(error);
    }

    const slugBase = slugifyTemplateTitle(input.title);
    for (
      let raceAttempt = 1;
      raceAttempt <= MAX_SLUG_RACE_ATTEMPTS;
      raceAttempt++
    ) {
      const slug = await this.nextAvailableSlug(actorId, slugBase);
      try {
        await this.db.transaction().execute(async (trx) => {
          await trx
            .insertInto("pdf_templates")
            .values({
              id: templateId,
              file_id: fileId,
              owner_id: actorId,
              visibility: "private",
              title: input.title,
              slug,
              game_system: input.gameSystem,
              storage_path: storageKey,
              sha256,
              page_count: pdf.pageCount,
              allow_vision: input.allowVision,
              catalog_status: "pending",
              is_public: input.isPublic,
            })
            .execute();
          const catalogJob = await trx
            .insertInto("catalog_jobs")
            .values({
              template_id: templateId,
              current_step: "queued",
              progress: 0,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
          await this.jobs.enqueueCatalog(trx, {
            templateId,
            catalogJobId: catalogJob.id,
          });
          await trx
            .updateTable("object_files")
            .set({ state: "ready" })
            .where("id", "=", fileId)
            .execute();
        });
        return { kind: "created", templateId };
      } catch (error) {
        if (
          isUniqueViolation(error) &&
          constraintName(error) === SLUG_CONSTRAINT &&
          raceAttempt < MAX_SLUG_RACE_ATTEMPTS
        ) {
          continue;
        }
        await this.storage.delete(storageKey).catch(() => undefined);
        await this.db.deleteFrom("object_files").where("id", "=", fileId).execute();
        if (isUniqueViolation(error)) {
          const winner = await this.findActiveDuplicate(actorId, sha256);
          if (winner) {
            return { kind: "existing", templateId: winner.id };
          }
        }
        throw error;
      }
    }
    throw new AppError(
      "TEMPLATE_SLUG_CONFLICT",
      409,
      "Could not allocate a unique slug for the template.",
    );
  }

  private async findActiveDuplicate(
    actorId: string,
    sha256: string,
  ): Promise<{ id: string } | undefined> {
    return this.db
      .selectFrom("pdf_templates")
      .select("id")
      .where("owner_id", "=", actorId)
      .where("sha256", "=", sha256)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
  }

  private async nextAvailableSlug(actorId: string, base: string): Promise<string> {
    const existing = new Set(
      (
        await this.db
          .selectFrom("pdf_templates")
          .select("slug")
          .where("owner_id", "=", actorId)
          .where((eb) =>
            eb.or([
              eb("slug", "=", base),
              eb("slug", "like", `${base}-%`),
            ]),
          )
          .execute()
      ).map((row) => row.slug),
    );
    for (let suffix = 1; suffix <= MAX_SLUG_SUFFIX; suffix++) {
      const candidate = slugCandidate(base, suffix);
      if (!existing.has(candidate)) return candidate;
    }
    throw new AppError(
      "TEMPLATE_SLUG_CONFLICT",
      409,
      "Could not allocate a unique slug for the template.",
    );
  }

  // Restores a soft-deleted owner template with identical content instead of
  // inserting a conflicting row. Catalog fields and character links survive;
  // metadata comes from the fresh upload form, including visibility.
  private async restoreTrashedDuplicate(
    actorId: string,
    sha256: string,
    input: TemplateUpload,
  ): Promise<string | null> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
    return this.db.transaction().execute(async (trx) => {
      const candidates = await trx
        .selectFrom("pdf_templates as template")
        .innerJoin("object_files as file", "file.id", "template.file_id")
        .select([
          "template.id",
          "template.storage_path as storagePath",
          "file.state as fileState",
        ])
        .where("template.owner_id", "=", actorId)
        .where("template.sha256", "=", sha256)
        .where("template.deleted_at", "is not", null)
        .where("template.deleted_at", ">", cutoff)
        .orderBy("template.deleted_at", "desc")
        .forUpdate()
        .execute();
      let candidate: (typeof candidates)[number] | undefined;
      for (const current of candidates) {
        if (current.fileState !== "ready") continue;
        try {
          await this.storage.stat(current.storagePath);
          candidate = current;
          break;
        } catch {
          // Try an older retained copy before creating a new template row.
        }
      }
      if (!candidate) return null;
      await trx
        .updateTable("pdf_templates")
        .set({
          deleted_at: null,
          title: input.title,
          game_system: input.gameSystem,
          allow_vision: input.allowVision,
          is_public: input.isPublic,
          updated_at: new Date(),
        })
        .where("id", "=", candidate.id)
        .where("deleted_at", "is not", null)
        .execute();
      return candidate.id;
    });
  }
}

function validateMetadata(input: TemplateUpload): void {
  if (
    !input.title ||
    input.title.length > 160 ||
    !input.gameSystem ||
    input.gameSystem.length > 160
  ) {
    throw new AppError("VALIDATION_FAILED", 400, "Template metadata is invalid.");
  }
}

async function validatePdf(bytes: Uint8Array): Promise<{ pageCount: number }> {
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new AppError("PDF_TOO_LARGE", 413, "PDF is larger than 25 MB.");
  }
  if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    throw new AppError("PDF_INVALID_MAGIC", 422, "The uploaded file is not a PDF.");
  }
  try {
    const document = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const pageCount = document.getPageCount();
    if (pageCount < 1 || pageCount > MAX_PDF_PAGES) {
      throw new AppError(
        "PDF_PAGE_LIMIT",
        422,
        `PDF must contain between 1 and ${MAX_PDF_PAGES} pages.`,
      );
    }
    const acroFormReference = document.catalog.get(PDFName.of("AcroForm"));
    const acroForm = acroFormReference
      ? document.context.lookup(acroFormReference, PDFDict)
      : undefined;
    const hasXfa = acroForm?.has(PDFName.of("XFA")) ?? false;
    const fields = document.getForm().getFields();
    if (hasXfa && fields.length === 0) {
      throw new AppError("PDF_XFA_UNSUPPORTED", 422, "XFA-only PDFs are not supported.");
    }
    if (fields.length === 0) {
      throw new AppError(
        "PDF_ACROFORM_REQUIRED",
        422,
        "PDF does not contain editable AcroForm fields.",
      );
    }
    return { pageCount };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("encrypt")) {
      throw new AppError("PDF_ENCRYPTED", 422, "Encrypted PDFs are not supported.");
    }
    throw new AppError("PDF_INVALID", 422, "PDF cannot be opened.");
  }
}

function storageAppError(error: unknown): AppError {
  if (error instanceof StorageError) {
    if (error.code === "STORAGE_FULL") {
      return new AppError("STORAGE_FULL", 507, "PDF storage is full.");
    }
    if (error.code === "INVALID_STORAGE_KEY") {
      return new AppError("INVALID_STORAGE_KEY", 400, "Storage key is invalid.");
    }
  }
  return new AppError("STORAGE_WRITE_FAILED", 503, "PDF could not be stored.");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function constraintName(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "constraint" in error
    ? String((error as { constraint?: unknown }).constraint ?? "")
    : undefined;
}
