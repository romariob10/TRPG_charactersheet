import type { Database } from "@mycharacter/database";
import type { CharacterField, FieldValue, TemplateField } from "@mycharacter/contracts";
import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";
import { loadTemplateFields } from "../templates/repository.js";

export type CharacterDatabase = Kysely<Database> | Transaction<Database>;

export interface CharacterAccessRow {
  id: string;
  templateId: string | null;
  sheetVersionId: string | null;
  systemId: string | null;
  ownerId: string;
  name: string;
  slug: string;
  isPublic: boolean;
  publishedAt: Date | null;
  status: "active" | "trashed";
  revision: string;
  deletedAt: Date | null;
  updatedAt: Date;
  catalogStatus: "pending" | "processing" | "ready" | "partial" | "failed";
  pageCount: number;
  gameSystem: string | null;
  likeCount: number;
  likedByMeCount: number;
  memberRole: "editor" | null;
}

export async function findCharacterAccess(
  db: CharacterDatabase,
  actorId: string,
  characterId: string,
): Promise<CharacterAccessRow | undefined> {
  const row = await db
    .selectFrom("characters as character")
    .leftJoin("pdf_templates as template", "template.id", "character.template_id")
    .leftJoin("game_systems as game_system", "game_system.id", "character.system_id")
    .leftJoin("character_members as member", (join) =>
      join
        .onRef("member.character_id", "=", "character.id")
        .on("member.user_id", "=", actorId),
    )
    .select([
      "character.id",
      "character.template_id as templateId",
      "character.sheet_version_id as sheetVersionId",
      "character.system_id as systemId",
      "character.owner_id as ownerId",
      "character.name",
      "character.slug",
      "character.is_public as isPublic",
      "character.published_at as publishedAt",
      "character.status",
      "character.revision",
      "character.deleted_at as deletedAt",
      "character.updated_at as updatedAt",
      sql<"pending" | "processing" | "ready" | "partial" | "failed">`COALESCE(template.catalog_status, 'ready')`.as("catalogStatus"),
      sql<number>`COALESCE(template.page_count, 1)`.as("pageCount"),
      sql<string | null>`COALESCE(template.game_system, game_system.title)`.as("gameSystem"),
      "member.role as memberRole",
      (eb) =>
        eb
          .selectFrom("character_likes")
          .select(sql<number>`count(*)::int`.as("count"))
          .whereRef("character_likes.character_id", "=", "character.id")
          .as("likeCount"),
      (eb) =>
        eb
          .selectFrom("character_likes")
          .select(sql<number>`count(*)::int`.as("count"))
          .whereRef("character_likes.character_id", "=", "character.id")
          .where("character_likes.user_id", "=", actorId)
          .as("likedByMeCount"),
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
    .leftJoin("pdf_templates as template", "template.id", "character.template_id")
    .leftJoin("game_systems as game_system", "game_system.id", "character.system_id")
    .leftJoin("character_members as member", (join) =>
      join
        .onRef("member.character_id", "=", "character.id")
        .on("member.user_id", "=", actorId),
    )
    .select([
      "character.id",
      "character.template_id as templateId",
      "character.sheet_version_id as sheetVersionId",
      "character.system_id as systemId",
      "character.owner_id as ownerId",
      "character.name",
      "character.slug",
      "character.is_public as isPublic",
      "character.published_at as publishedAt",
      "character.status",
      "character.revision",
      "character.deleted_at as deletedAt",
      "character.updated_at as updatedAt",
      sql<"pending" | "processing" | "ready" | "partial" | "failed">`COALESCE(template.catalog_status, 'ready')`.as("catalogStatus"),
      sql<number>`COALESCE(template.page_count, 1)`.as("pageCount"),
      sql<string | null>`COALESCE(template.game_system, game_system.title)`.as("gameSystem"),
      "member.role as memberRole",
      (eb) =>
        eb
          .selectFrom("character_likes")
          .select(sql<number>`count(*)::int`.as("count"))
          .whereRef("character_likes.character_id", "=", "character.id")
          .as("likeCount"),
      (eb) =>
        eb
          .selectFrom("character_likes")
          .select(sql<number>`count(*)::int`.as("count"))
          .whereRef("character_likes.character_id", "=", "character.id")
          .where("character_likes.user_id", "=", actorId)
          .as("likedByMeCount"),
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

export async function loadCharacterSheetFieldValues(
  db: Kysely<Database>,
  characterId: string,
): Promise<Record<string, FieldValue>> {
  const rows = await db
    .selectFrom("character_sheet_field_values")
    .select(["field_key", "value"])
    .where("character_id", "=", characterId)
    .execute();

  const result: Record<string, FieldValue> = {};
  for (const row of rows) {
    result[row.field_key] = row.value as FieldValue;
  }
  return result;
}

function normalizeValue(value: unknown): CharacterField["value"] {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value as string[];
  }
  return null;
}
