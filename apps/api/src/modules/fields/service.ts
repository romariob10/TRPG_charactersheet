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

      const fieldDef = publishedFields.find((f) => f.key === fieldKey);
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

      // Check idempotency with character_mutations
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
        if (existing.userId !== actorId || existing.fieldId !== fieldKey) {
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

      // Optimistic concurrency check: if expectedVersion is provided and differs, throw 409
      if (
        input.expectedVersion !== undefined &&
        input.expectedVersion !== null &&
        input.expectedVersion !== currentVersion
      ) {
        throw new AppError(
          "VERSION_CONFLICT",
          409,
          `Version conflict on field '${fieldKey}'. Expected version ${input.expectedVersion}, but current version is ${currentVersion}.`,
        );
      }

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
        .insertInto("character_mutations")
        .values({
          character_id: characterId,
          client_mutation_id: input.clientMutationId,
          field_id: fieldKey,
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
