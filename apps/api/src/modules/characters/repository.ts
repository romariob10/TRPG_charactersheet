import type { Database } from "@mycharacter/database";
import type { CharacterField, TemplateField } from "@mycharacter/contracts";
import type { Kysely, Transaction } from "kysely";
import { loadTemplateFields } from "../templates/repository.js";

export type CharacterDatabase = Kysely<Database> | Transaction<Database>;

export interface CharacterAccessRow {
  id: string;
  templateId: string;
  ownerId: string;
  name: string;
  status: "active" | "trashed";
  revision: string;
  deletedAt: Date | null;
  updatedAt: Date;
  catalogStatus: "pending" | "processing" | "ready" | "partial" | "failed";
  pageCount: number;
  memberRole: "editor" | null;
}

export async function findCharacterAccess(
  db: CharacterDatabase,
  actorId: string,
  characterId: string,
): Promise<CharacterAccessRow | undefined> {
  const row = await db
    .selectFrom("characters as character")
    .innerJoin("pdf_templates as template", "template.id", "character.template_id")
    .leftJoin("character_members as member", (join) =>
      join
        .onRef("member.character_id", "=", "character.id")
        .on("member.user_id", "=", actorId),
    )
    .select([
      "character.id",
      "character.template_id as templateId",
      "character.owner_id as ownerId",
      "character.name",
      "character.status",
      "character.revision",
      "character.deleted_at as deletedAt",
      "character.updated_at as updatedAt",
      "template.catalog_status as catalogStatus",
      "template.page_count as pageCount",
      "member.role as memberRole",
    ])
    .where("character.id", "=", characterId)
    .executeTakeFirst();
  return row as CharacterAccessRow | undefined;
}

export async function listCharacters(
  db: CharacterDatabase,
  actorId: string,
): Promise<CharacterAccessRow[]> {
  const rows = await db
    .selectFrom("characters as character")
    .innerJoin("pdf_templates as template", "template.id", "character.template_id")
    .leftJoin("character_members as member", (join) =>
      join
        .onRef("member.character_id", "=", "character.id")
        .on("member.user_id", "=", actorId),
    )
    .select([
      "character.id",
      "character.template_id as templateId",
      "character.owner_id as ownerId",
      "character.name",
      "character.status",
      "character.revision",
      "character.deleted_at as deletedAt",
      "character.updated_at as updatedAt",
      "template.catalog_status as catalogStatus",
      "template.page_count as pageCount",
      "member.role as memberRole",
    ])
    .where((eb) =>
      eb.or([
        eb("character.owner_id", "=", actorId),
        eb.and([
          eb("member.user_id", "=", actorId),
          eb("character.status", "=", "active"),
        ]),
      ]),
    )
    .orderBy("character.updated_at", "desc")
    .execute();
  return rows as CharacterAccessRow[];
}

export async function loadCharacterFields(
  db: Kysely<Database>,
  characterId: string,
  templateId: string,
): Promise<CharacterField[]> {
  const fields = await loadTemplateFields(db, templateId);
  const values = await db
    .selectFrom("character_values")
    .select([
      "field_id as fieldId",
      "value",
      "version",
      "updated_at as updatedAt",
      "updated_by as updatedBy",
    ])
    .where("character_id", "=", characterId)
    .execute();
  const byField = new Map(values.map((value) => [value.fieldId, value]));
  return fields
    .filter((field: TemplateField) => field.enabled)
    .map((field) => {
      const saved = byField.get(field.id);
      return {
        id: field.id,
        pdfName: field.pdfName,
        kind: field.kind,
        label: field.label,
        aliases: field.aliases,
        section: field.section,
        page: field.page,
        options: field.options,
        groupId: field.groupId,
        groupOrder: field.groupOrder,
        confidence: field.confidence,
        source: field.source,
        widgets: field.widgets,
        value: normalizeValue(saved?.value),
        version: saved?.version ?? 0,
        updatedAt: (saved?.updatedAt ?? new Date(0)).toISOString(),
        updatedBy: saved?.updatedBy ?? null,
      };
    });
}

function normalizeValue(value: unknown): CharacterField["value"] {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value as string[];
  }
  return null;
}
