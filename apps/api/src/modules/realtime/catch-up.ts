import type {
  CharacterChangesResponse,
  FieldChangedEvent,
  FieldValue,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { AppError } from "../../errors.js";
import { CharacterService } from "../characters/service.js";

export class RealtimeCatchUpService {
  private readonly characters: CharacterService;

  constructor(private readonly db: Kysely<Database>) {
    this.characters = new CharacterService(db);
  }

  async getChanges(
    actorId: string,
    characterId: string,
    afterRevision: number,
  ): Promise<CharacterChangesResponse> {
    const character = await this.characters.getEditor(actorId, characterId);
    if (afterRevision >= character.revision) {
      return { mode: "changes", revision: character.revision, changes: [] };
    }

    const rows = await this.db
      .selectFrom("character_mutations")
      .select([
        "field_id as fieldId",
        "value",
        "version",
        "revision",
        "user_id as updatedBy",
        "created_at as updatedAt",
      ])
      .where("character_id", "=", characterId)
      .where("revision", ">", String(afterRevision))
      .orderBy("revision", "asc")
      .execute();

    if (rows.length === 0 || Number(rows[0]!.revision) !== afterRevision + 1) {
      return { mode: "snapshot", character };
    }

    return {
      mode: "changes",
      revision: character.revision,
      changes: rows.map((row): FieldChangedEvent => ({
        protocolVersion: 1,
        type: "field.changed",
        characterId,
        fieldId: row.fieldId,
        value: normalizeValue(row.value),
        version: row.version,
        revision: toSafeRevision(row.revision),
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: row.updatedBy,
      })),
    };
  }
}

function normalizeValue(value: unknown): FieldValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  ) {
    return value as FieldValue;
  }
  throw new AppError("INTERNAL_ERROR", 500, "Stored field value is invalid.");
}

function toSafeRevision(value: string): number {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new AppError("REVISION_OVERFLOW", 500, "Character revision is too large.");
  }
  return revision;
}
