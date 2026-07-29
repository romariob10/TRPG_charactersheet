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

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 20;

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
  ): Promise<
    | { kind: "created"; templateId: string }
    | { kind: "existing"; templateId: string }
    | { kind: "community"; duplicateCommunity: DuplicateCommunityTemplate }
  > {
    validateMetadata(input);
    const pdf = await validatePdf(input.bytes);
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const existing = await this.db
      .selectFrom("pdf_templates")
      .select("id")
      .where("owner_id", "=", actorId)
      .where("sha256", "=", sha256)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (existing) {
      return { kind: "existing", templateId: existing.id };
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
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      await this.db.deleteFrom("object_files").where("id", "=", fileId).execute();
      throw error;
    }
    return { kind: "created", templateId };
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
