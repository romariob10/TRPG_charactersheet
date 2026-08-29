import type {
  FieldMutationRequest,
  FieldMutationResponse,
  FieldValue,
  SheetFieldDefinition,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { AppError } from "../../errors.js";
import { CharacterService } from "../characters/service.js";
import type { RealtimeBus } from "../../realtime/realtime-bus.js";
import { validateFieldValue } from "./value-validation.js";

export class FieldService {
  private readonly db: Kysely<Database>;
  private readonly characters: CharacterService;
  private readonly realtime: RealtimeBus;

  public constructor(
    database: Kysely<Database>,
    realtime: RealtimeBus,
  ) {
    this.db = database;
    this.characters = new CharacterService(database);
    this.realtime = realtime;
  }

  async saveCharacterField(
    actorId: string,
    characterId: string,
    fieldId: string,
    input: FieldMutationRequest,
  ): Promise<FieldMutationResponse> {
    const result = await this.db.transaction().execute(async (trx) => {
      const lockedCharacter = await trx
        .selectFrom("characters")
        .select("id")
        .where("id", "=", characterId)
        .forUpdate()
        .executeTakeFirst();
      if (!lockedCharacter) throw characterNotFound();
      await this.characters.authorizeCharacter(
        actorId,
        characterId,
        "edit",
        trx,
      );

      const existing = await trx
        .selectFrom("character_mutations")
        .select([
          "user_id as userId",
          "field_id as fieldId",
          "value",
          "version",
          "revision",
          "overwritten_remote as overwrittenRemote",
          "created_at as createdAt",
        ])
        .where("character_id", "=", characterId)
        .where("client_mutation_id", "=", input.clientMutationId)
        .executeTakeFirst();
      if (existing) {
        if (existing.userId !== actorId || existing.fieldId !== fieldId) {
          throw new AppError(
            "CLIENT_MUTATION_REUSED",
            409,
            "This mutation identifier has already been used.",
          );
        }
        return {
          publish: false,
          response: {
            value: normalizeValue(existing.value),
            version: existing.version,
            revision: toSafeNumber(existing.revision),
            overwrittenRemote: existing.overwrittenRemote,
            updatedAt: existing.createdAt.toISOString(),
            updatedBy: existing.userId,
          },
        };
      }

      const field = await trx
        .selectFrom("characters as character")
        .innerJoin("pdf_fields as field", "field.template_id", "character.template_id")
        .select(["field.kind", "field.options"])
        .where("character.id", "=", characterId)
        .where("field.id", "=", fieldId)
        .where("field.is_enabled", "=", true)
        .executeTakeFirst();
      if (!field) throw fieldNotFound();
      validateFieldValue(field, input.value);

      const current = await trx
        .selectFrom("character_values")
        .select("version")
        .where("character_id", "=", characterId)
        .where("field_id", "=", fieldId)
        .forUpdate()
        .executeTakeFirst();

      const currentVersion = current?.version ?? 0;
      const version = currentVersion + 1;
      const overwrittenRemote = currentVersion !== input.expectedVersion;
      const updatedAt = new Date();
      const storedValue = serializeJson(input.value);

      await trx
        .insertInto("character_values")
        .values({
          character_id: characterId,
          field_id: fieldId,
          value: storedValue,
          version,
          updated_by: actorId,
          updated_at: updatedAt,
        })
        .onConflict((oc) =>
          oc.columns(["character_id", "field_id"]).doUpdateSet({
            value: storedValue,
            version,
            updated_by: actorId,
            updated_at: updatedAt,
          }),
        )
        .execute();

      const character = await trx
        .updateTable("characters")
        .set({
          revision: sql`revision + 1`,
          updated_at: updatedAt,
        })
        .where("id", "=", characterId)
        .returning("revision")
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("character_mutations")
        .values({
          character_id: characterId,
          client_mutation_id: input.clientMutationId,
          field_id: fieldId,
          user_id: actorId,
          value: storedValue,
          version,
          revision: character.revision,
          overwritten_remote: overwrittenRemote,
          created_at: updatedAt,
        })
        .execute();

      return {
        publish: true,
        response: {
          value: input.value,
          version,
          revision: toSafeNumber(character.revision),
          overwrittenRemote,
          updatedAt: updatedAt.toISOString(),
          updatedBy: actorId,
        },
      };
    });

    if (result.publish) {
      this.realtime.publish({
        protocolVersion: 1,
        type: "field.changed",
        characterId,
        fieldId,
        value: result.response.value,
        version: result.response.version,
        revision: result.response.revision,
        updatedAt: result.response.updatedAt,
        updatedBy: result.response.updatedBy,
      });
    }
    return result.response;
  }

  async saveCharacterSheetField(
    actorId: string,
    characterId: string,
    fieldKey: string,
    input: FieldMutationRequest,
  ): Promise<FieldMutationResponse> {
    const result = await this.db.transaction().execute(async (trx) => {
      const lockedCharacter = await trx
        .selectFrom("characters")
        .select(["id", "sheet_version_id as sheetVersionId"])
        .where("id", "=", characterId)
        .forUpdate()
        .executeTakeFirst();
      if (!lockedCharacter) throw characterNotFound();
      await this.characters.authorizeCharacter(
        actorId,
        characterId,
        "edit",
        trx,
      );

      if (!lockedCharacter.sheetVersionId) {
        throw new AppError(
          "INVALID_CHARACTER_TYPE",
          400,
          "Character does not use a modular sheet version.",
        );
      }

      // Validate that fieldKey exists in the published sheet version
      const versionRow = await trx
        .selectFrom("sheet_versions")
        .select("fields")
        .where("id", "=", lockedCharacter.sheetVersionId)
        .executeTakeFirst();

      if (!versionRow) {
        throw new AppError("VERSION_NOT_FOUND", 404, "Published sheet version not found.");
      }

      const publishedFields: SheetFieldDefinition[] =
        typeof versionRow.fields === "string"
          ? JSON.parse(versionRow.fields)
          : (versionRow.fields ?? []);

      const layoutMetadata = parseLayoutMetadataFieldKey(fieldKey);
      const fieldDef = publishedFields.find(
        (field) => field.key === (layoutMetadata?.baseFieldKey ?? fieldKey),
      );
      if (!fieldDef) {
        throw new AppError(
          "FIELD_NOT_FOUND",
          404,
          `Field key '${fieldKey}' does not exist in the published sheet version definition.`,
        );
      }

      if (fieldDef.readOnly) {
        throw new AppError("FIELD_READONLY", 403, `Field '${fieldKey}' is read-only.`);
      }

      if (layoutMetadata) {
        const numericValue = input.value;
        if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
          throw new AppError("VALIDATION_FAILED", 400, "Layout metadata must be numeric.");
        }
        if (
          layoutMetadata.kind === "height" &&
          (fieldDef.kind !== "multiline" || numericValue < 48 || numericValue > 10_000)
        ) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Textarea height must be between 48 and 10000 pixels.",
          );
        }
        if (
          layoutMetadata.kind === "fontSize" &&
          (fieldDef.kind !== "multiline" || numericValue < 8 || numericValue > 32)
        ) {
          throw new AppError("VALIDATION_FAILED", 400, "Textarea font size must be between 8 and 32 pixels.");
        }
        if (
          layoutMetadata.kind === "imageAspectRatio" &&
          (fieldDef.kind !== "avatar" || numericValue < 0.4 || numericValue > 2.5)
        ) {
          throw new AppError("VALIDATION_FAILED", 400, "Image aspect ratio must be between 0.4 and 2.5.");
        }
      }

      // Modular sheet keys are text, so they use a separate mutation log from
      // legacy PDF fields whose mutation log is constrained to UUID field ids.
      const existing = await trx
        .selectFrom("character_sheet_field_mutations")
        .select([
          "user_id as userId",
          "field_key as fieldKey",
          "value",
          "version",
          "revision",
          "overwritten_remote as overwrittenRemote",
          "created_at as createdAt",
        ])
        .where("character_id", "=", characterId)
        .where("client_mutation_id", "=", input.clientMutationId)
        .executeTakeFirst();

      if (existing) {
        if (existing.userId !== actorId || existing.fieldKey !== fieldKey) {
          throw new AppError(
            "CLIENT_MUTATION_REUSED",
            409,
            "This mutation identifier has already been used.",
          );
        }
        return {
          publish: false,
          response: {
            value: normalizeValue(existing.value),
            version: existing.version,
            revision: toSafeNumber(existing.revision),
            overwrittenRemote: existing.overwrittenRemote,
            updatedAt: existing.createdAt.toISOString(),
            updatedBy: existing.userId,
          },
        };
      }

      const current = await trx
        .selectFrom("character_sheet_field_values")
        .select("version")
        .where("character_id", "=", characterId)
        .where("field_key", "=", fieldKey)
        .forUpdate()
        .executeTakeFirst();

      const currentVersion = current?.version ?? 0;

      const version = currentVersion + 1;
      const overwrittenRemote = currentVersion !== input.expectedVersion;
      const updatedAt = new Date();
      const storedValue = serializeJson(input.value);

      await trx
        .insertInto("character_sheet_field_values")
        .values({
          character_id: characterId,
          field_key: fieldKey,
          value: storedValue,
          version,
          updated_by: actorId,
          updated_at: updatedAt,
        })
        .onConflict((oc) =>
          oc.columns(["character_id", "field_key"]).doUpdateSet({
            value: storedValue,
            version,
            updated_by: actorId,
            updated_at: updatedAt,
          }),
        )
        .execute();

      const character = await trx
        .updateTable("characters")
        .set({
          revision: sql`revision + 1`,
          updated_at: updatedAt,
        })
        .where("id", "=", characterId)
        .returning("revision")
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("character_sheet_field_mutations")
        .values({
          character_id: characterId,
          client_mutation_id: input.clientMutationId,
          field_key: fieldKey,
          user_id: actorId,
          value: storedValue,
          version,
          revision: character.revision,
          overwritten_remote: overwrittenRemote,
          created_at: updatedAt,
        })
        .execute();

      return {
        publish: true,
        response: {
          value: input.value,
          version,
          revision: toSafeNumber(character.revision),
          overwrittenRemote,
          updatedAt: updatedAt.toISOString(),
          updatedBy: actorId,
        },
      };
    });

    if (result.publish) {
      this.realtime.publish({
        protocolVersion: 1,
        type: "field.changed",
        characterId,
        fieldId: fieldKey,
        value: result.response.value,
        version: result.response.version,
        revision: result.response.revision,
        updatedAt: result.response.updatedAt,
        updatedBy: result.response.updatedBy,
      });
    }

    return result.response;
  }
}

function serializeJson(value: FieldValue): string {
  return JSON.stringify(value);
}

function parseLayoutMetadataFieldKey(fieldKey: string): {
  kind: "height" | "fontSize" | "imageAspectRatio";
  baseFieldKey: string;
} | null {
  const prefixes = [
    ["__layout_height__:", "height"],
    ["__layout_font_size__:", "fontSize"],
    ["__image_aspect_ratio__:", "imageAspectRatio"],
  ] as const;
  for (const [prefix, kind] of prefixes) {
    if (!fieldKey.startsWith(prefix)) continue;
    const baseFieldKey = fieldKey.slice(prefix.length);
    return baseFieldKey ? { kind, baseFieldKey } : null;
  }
  return null;
}

function normalizeValue(value: unknown): FieldValue {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value as string[];
  }
  throw new AppError("INTERNAL_ERROR", 500, "Stored field value is invalid.");
}

function toSafeNumber(value: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new AppError("REVISION_OVERFLOW", 500, "Character revision is too large.");
  }
  return result;
}

function characterNotFound(): AppError {
  return new AppError("NOT_FOUND", 404, "Character not found.");
}

function fieldNotFound(): AppError {
  return new AppError("FIELD_NOT_FOUND", 404, "Field not found.");
}
