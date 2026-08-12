import type {
  TemplateScope,
  TemplateEditorData,
  TemplateField,
  TemplateSummary,
  UpdateTemplateFieldRequest,
  UpdateTemplateRequest,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { ObjectStorage } from "@mycharacter/storage";
import type { Kysely } from "kysely";
import { AppError } from "../../errors.js";
import {
  findTemplate,
  listTemplates,
  loadTemplateFields,
  templateSummaryFromRow,
  TRASH_RETENTION_MS,
  type TemplateRow,
} from "./repository.js";

export class TemplateService {
  private readonly db: Kysely<Database>;
  private readonly storage: ObjectStorage;

  public constructor(database: Kysely<Database>, storage: ObjectStorage) {
    this.db = database;
    this.storage = storage;
  }

  async list(actorId: string, scope: TemplateScope): Promise<TemplateSummary[]> {
    return (await listTemplates(this.db, actorId, scope)).map((row) =>
      this.toSummary(row),
    );
  }

  async get(actorId: string, templateId: string): Promise<TemplateSummary> {
    return this.toSummary(await this.requireVisible(actorId, templateId));
  }

  async getEditor(actorId: string, templateId: string): Promise<TemplateEditorData> {
    const template = await findTemplate(this.db, actorId, templateId);
    if (!template || template.ownerId !== actorId || template.deletedAt !== null) {
      throw notFound();
    }
    return {
      ...this.toSummary(template),
      fields: await loadTemplateFields(this.db, templateId),
      pdfUrl: `/api/templates/${templateId}/pdf`,
    };
  }

  async update(
    actorId: string,
    templateId: string,
    input: UpdateTemplateRequest,
  ): Promise<TemplateSummary> {
    const template = await findTemplate(this.db, actorId, templateId);
    if (!template || template.deletedAt !== null || template.ownerId !== actorId) {
      throw notFound();
    }
    await this.db
      .updateTable("pdf_templates")
      .set({
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.gameSystem === undefined ? {} : { game_system: input.gameSystem }),
        ...(input.isPublic === undefined ? {} : { is_public: input.isPublic }),
      })
      .where("id", "=", templateId)
      .execute();
    return this.get(actorId, templateId);
  }

  async subscribe(actorId: string, templateId: string): Promise<void> {
    const template = await findTemplate(this.db, actorId, templateId);
    if (
      !template ||
      template.deletedAt !== null ||
      template.ownerId === actorId ||
      template.visibility !== "private" ||
      !template.isPublic ||
      template.approvedAt === null ||
      !["ready", "partial"].includes(template.catalogStatus)
    ) {
      throw notFound();
    }
    await this.db
      .insertInto("template_subscriptions")
      .values({ user_id: actorId, template_id: templateId })
      .onConflict((oc) => oc.columns(["user_id", "template_id"]).doNothing())
      .execute();
  }

  async unsubscribe(actorId: string, templateId: string): Promise<void> {
    await this.db
      .deleteFrom("template_subscriptions")
      .where("user_id", "=", actorId)
      .where("template_id", "=", templateId)
      .execute();
  }

  async approve(actorId: string, templateId: string): Promise<TemplateSummary> {
    const template = await findTemplate(this.db, actorId, templateId);
    if (!template || template.ownerId !== actorId || template.deletedAt !== null) {
      throw notFound();
    }
    if (!["ready", "partial"].includes(template.catalogStatus)) {
      throw new AppError("TEMPLATE_NOT_READY", 409, "Template catalog is not ready.");
    }
    const enabled = await this.db
      .selectFrom("pdf_fields")
      .select("id")
      .where("template_id", "=", templateId)
      .where("is_enabled", "=", true)
      .executeTakeFirst();
    if (!enabled) {
      throw new AppError(
        "TEMPLATE_FIELDS_REQUIRED",
        409,
        "Enable at least one field before approval.",
      );
    }
    await this.db
      .updateTable("pdf_templates")
      .set({ catalog_approved_at: new Date(), catalog_approved_by: actorId })
      .where("id", "=", templateId)
      .execute();
    return this.get(actorId, templateId);
  }

  async updateField(
    actorId: string,
    templateId: string,
    fieldId: string,
    input: UpdateTemplateFieldRequest,
  ): Promise<TemplateField> {
    const template = await findTemplate(this.db, actorId, templateId);
    if (!template || template.ownerId !== actorId || template.deletedAt !== null) {
      throw notFound();
    }
    const updated = await this.db.transaction().execute(async (trx) => {
      const field = await trx
        .updateTable("pdf_fields")
        .set({
          auto_label: input.label,
          auto_aliases: input.aliases,
          auto_section: input.section,
          auto_group_id: input.groupId,
          auto_group_order: input.groupOrder,
          is_enabled: input.enabled,
          confidence: 1,
          source: "manual",
          updated_at: new Date(),
        })
        .where("id", "=", fieldId)
        .where("template_id", "=", templateId)
        .returning("id")
        .executeTakeFirst();
      if (!field) throw fieldNotFound();
      await trx
        .updateTable("pdf_templates")
        .set({
          catalog_approved_at: null,
          catalog_approved_by: null,
          updated_at: new Date(),
        })
        .where("id", "=", templateId)
        .execute();
      return field;
    });
    const fields = await loadTemplateFields(this.db, templateId);
    const field = fields.find((candidate) => candidate.id === updated.id);
    if (!field) throw fieldNotFound();
    return field;
  }

  async trash(actorId: string, templateId: string): Promise<void> {
    const template = await findTemplate(this.db, actorId, templateId);
    if (!template || template.ownerId !== actorId || template.deletedAt !== null) {
      throw notFound();
    }
    await this.db
      .updateTable("pdf_templates")
      .set({ deleted_at: new Date(), is_public: false })
      .where("id", "=", templateId)
      .execute();
  }

  async restore(actorId: string, templateId: string): Promise<TemplateSummary> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const template = await trx
          .selectFrom("pdf_templates as template")
          .innerJoin("object_files as file", "file.id", "template.file_id")
          .select([
            "template.sha256",
            "template.deleted_at as deletedAt",
            "template.storage_path as storagePath",
            "file.state as fileState",
          ])
          .where("template.id", "=", templateId)
          .where("template.owner_id", "=", actorId)
          .where("template.deleted_at", "is not", null)
          .forUpdate()
          .executeTakeFirst();
        if (
          !template?.deletedAt ||
          template.deletedAt.getTime() <= Date.now() - TRASH_RETENTION_MS
        ) {
          throw notFound();
        }
        if (template.fileState !== "ready") {
          throw fileUnavailable();
        }
        try {
          await this.storage.stat(template.storagePath);
        } catch {
          throw fileUnavailable();
        }
        const activeDuplicate = await trx
          .selectFrom("pdf_templates")
          .select("id")
          .where("owner_id", "=", actorId)
          .where("sha256", "=", template.sha256)
          .where("deleted_at", "is", null)
          .where("id", "!=", templateId)
          .executeTakeFirst();
        if (activeDuplicate) throw duplicateActive(activeDuplicate.id);
        await trx
          .updateTable("pdf_templates")
          .set({ deleted_at: null })
          .where("id", "=", templateId)
          .where("deleted_at", "is not", null)
          .execute();
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const trashed = await this.db
          .selectFrom("pdf_templates")
          .select("sha256")
          .where("id", "=", templateId)
          .where("owner_id", "=", actorId)
          .executeTakeFirst();
        if (!trashed) throw error;
        const activeDuplicate = await this.db
          .selectFrom("pdf_templates")
          .select("id")
          .where("owner_id", "=", actorId)
          .where("sha256", "=", trashed.sha256)
          .where("deleted_at", "is", null)
          .where("id", "!=", templateId)
          .executeTakeFirst();
        if (activeDuplicate) throw duplicateActive(activeDuplicate.id);
      }
      throw error;
    }
    return this.get(actorId, templateId);
  }

  private async requireVisible(actorId: string, templateId: string): Promise<TemplateRow> {
    const template = await findTemplate(this.db, actorId, templateId);
    const community =
      template &&
      template.deletedAt === null &&
      template.isPublic &&
      template.approvedAt !== null &&
      ["ready", "partial"].includes(template.catalogStatus);
    if (
      !template ||
      (template.deletedAt !== null && template.ownerId !== actorId) ||
      (template.ownerId !== actorId &&
        template.visibility !== "curated" &&
        !community)
    ) {
      throw notFound();
    }
    return template;
  }

  private toSummary(row: TemplateRow): TemplateSummary {
    return templateSummaryFromRow(row);
  }
}

function notFound(): AppError {
  return new AppError("NOT_FOUND", 404, "Template not found.");
}

function fieldNotFound(): AppError {
  return new AppError("FIELD_NOT_FOUND", 404, "Field not found.");
}

function fileUnavailable(): AppError {
  return new AppError(
    "TEMPLATE_FILE_UNAVAILABLE",
    409,
    "The original PDF is no longer available and this template cannot be restored.",
  );
}

function duplicateActive(activeTemplateId: string): AppError {
  return new AppError(
    "TEMPLATE_DUPLICATE_ACTIVE",
    409,
    "An active template with the same content already exists.",
    { activeTemplateId },
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
