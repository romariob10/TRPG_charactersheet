import type { Database } from "@mycharacter/database";
import type {
  AddRepeaterRowRequest,
  CharacterRepeaterRow,
  ReorderRepeaterRowsRequest,
  RepeaterRowValue,
  UpdateRepeaterRowFieldRequest,
} from "@mycharacter/contracts";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { AppError } from "../../errors.js";

function parseJsonValue(v: unknown): RepeaterRowValue {
  if (v === null) return null;
  if (typeof v === "boolean" || typeof v === "number") return v;
  if (typeof v === "string") return v;
  return null;
}

export class RepeaterService {
  private readonly db: Kysely<Database>;

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  async listRows(
    userId: string,
    characterId: string,
    repeaterKey: string,
  ): Promise<CharacterRepeaterRow[]> {
    await this.assertCharacterAccess(userId, characterId);

    const rows = await this.db
      .selectFrom("character_repeater_rows as crr")
      .where("crr.character_id", "=", characterId)
      .where("crr.repeater_key", "=", repeaterKey)
      .selectAll("crr")
      .orderBy("crr.position", "asc")
      .execute();

    if (rows.length === 0) return [];

    const rowIds = rows.map((r) => r.id);

    const values = await this.db
      .selectFrom("character_repeater_values")
      .where("row_id", "in", rowIds)
      .selectAll()
      .execute();

    const valueMap = new Map<string, Record<string, RepeaterRowValue>>();
    for (const v of values) {
      if (!valueMap.has(v.row_id)) {
        valueMap.set(v.row_id, {});
      }
      valueMap.get(v.row_id)![v.slot_id] = parseJsonValue(v.value);
    }

    return rows.map((r) => ({
      id: r.id,
      characterId: r.character_id,
      repeaterKey: r.repeater_key,
      position: r.position,
      version: r.version,
      values: valueMap.get(r.id) ?? {},
      updatedAt:
        r.updated_at instanceof Date
          ? r.updated_at.toISOString()
          : String(r.updated_at),
      updatedBy: r.updated_by,
    }));
  }

  async addRow(
    userId: string,
    characterId: string,
    input: AddRepeaterRowRequest,
  ): Promise<CharacterRepeaterRow> {
    await this.assertCharacterAccess(userId, characterId);

    // Idempotency check
    const existingMutation = await this.db
      .selectFrom("character_repeater_mutations")
      .where("character_id", "=", characterId)
      .where("client_mutation_id", "=", input.clientMutationId)
      .selectAll()
      .executeTakeFirst();

    if (existingMutation?.row_id) {
      const existingRow = await this.getRow(characterId, existingMutation.row_id);
      if (existingRow) return existingRow;
    }

    const currentCountRow = await this.db
      .selectFrom("character_repeater_rows")
      .where("character_id", "=", characterId)
      .where("repeater_key", "=", input.repeaterKey)
      .select([
        sql<number>`count(*)`.as("count"),
        sql<number>`coalesce(max(position), -1)`.as("maxPos"),
      ])
      .executeTakeFirst();

    const count = Number(currentCountRow?.count ?? 0);
    const maxPos = Number(currentCountRow?.maxPos ?? -1);

    if (count >= 100) {
      throw new AppError(
        "MAX_ROWS_EXCEEDED",
        400,
        "Cannot add more rows. Maximum limit of 100 rows reached.",
      );
    }

    const position = input.position !== undefined ? input.position : maxPos + 1;

    return this.db.transaction().execute(async (trx) => {
      const insertedRow = await trx
        .insertInto("character_repeater_rows")
        .values({
          character_id: characterId,
          repeater_key: input.repeaterKey,
          position,
          version: 1,
          updated_by: userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (input.initialValues && Object.keys(input.initialValues).length > 0) {
        for (const [slotId, slotVal] of Object.entries(input.initialValues)) {
          await trx
            .insertInto("character_repeater_values")
            .values({
              row_id: insertedRow.id,
              slot_id: slotId,
              value: JSON.stringify(slotVal),
            })
            .execute();
        }
      }

      await trx
        .insertInto("character_repeater_mutations")
        .values({
          character_id: characterId,
          client_mutation_id: input.clientMutationId,
          repeater_key: input.repeaterKey,
          row_id: insertedRow.id,
          action: "add",
          payload: JSON.stringify(input.initialValues ?? {}),
          version: 1,
        })
        .execute();

      return {
        id: insertedRow.id,
        characterId: insertedRow.character_id,
        repeaterKey: insertedRow.repeater_key,
        position: insertedRow.position,
        version: insertedRow.version,
        values: input.initialValues ?? {},
        updatedAt:
          insertedRow.updated_at instanceof Date
            ? insertedRow.updated_at.toISOString()
            : String(insertedRow.updated_at),
        updatedBy: insertedRow.updated_by,
      };
    });
  }

  async updateRowField(
    userId: string,
    characterId: string,
    rowId: string,
    slotId: string,
    input: UpdateRepeaterRowFieldRequest,
  ): Promise<CharacterRepeaterRow> {
    await this.assertCharacterAccess(userId, characterId);

    const row = await this.db
      .selectFrom("character_repeater_rows")
      .where("id", "=", rowId)
      .where("character_id", "=", characterId)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      throw new AppError("ROW_NOT_FOUND", 404, "Repeater row not found.");
    }

    if (row.version !== input.expectedVersion) {
      throw new AppError(
        "REVISION_CONFLICT",
        409,
        "Row was modified concurrently. Please refresh.",
      );
    }

    const nextVersion = row.version + 1;
    const now = new Date();

    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("character_repeater_values")
        .values({
          row_id: rowId,
          slot_id: slotId,
          value: JSON.stringify(input.value),
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.columns(["row_id", "slot_id"]).doUpdateSet({
            value: JSON.stringify(input.value),
            updated_at: now,
          }),
        )
        .execute();

      const updated = await trx
        .updateTable("character_repeater_rows")
        .set({
          version: nextVersion,
          updated_by: userId,
          updated_at: now,
        })
        .where("id", "=", rowId)
        .where("version", "=", input.expectedVersion)
        .executeTakeFirst();
      if (Number(updated.numUpdatedRows) !== 1) {
        throw new AppError("REVISION_CONFLICT", 409, "Row was modified concurrently.");
      }

      await trx
        .insertInto("character_repeater_mutations")
        .values({
          character_id: characterId,
          client_mutation_id: input.clientMutationId,
          repeater_key: row.repeater_key,
          row_id: rowId,
          action: "update",
          payload: JSON.stringify({ slotId, value: input.value }),
          version: nextVersion,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    });

    return (await this.getRow(characterId, rowId))!;
  }

  async removeRow(
    userId: string,
    characterId: string,
    rowId: string,
    clientMutationId: string,
  ): Promise<{ success: boolean }> {
    await this.assertCharacterAccess(userId, characterId);

    const row = await this.db
      .selectFrom("character_repeater_rows")
      .where("id", "=", rowId)
      .where("character_id", "=", characterId)
      .select(["id", "repeater_key", "position"])
      .executeTakeFirst();

    if (!row) {
      return { success: true };
    }

    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("character_repeater_rows")
        .where("id", "=", rowId)
        .execute();

      await trx
        .insertInto("character_repeater_mutations")
        .values({
          character_id: characterId,
          client_mutation_id: clientMutationId,
          repeater_key: row.repeater_key,
          row_id: rowId,
          action: "remove",
          payload: null,
          version: 1,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    });

    return { success: true };
  }

  async reorderRows(
    userId: string,
    characterId: string,
    input: ReorderRepeaterRowsRequest,
  ): Promise<{ success: boolean }> {
    await this.assertCharacterAccess(userId, characterId);

    const rows = await this.db.selectFrom("character_repeater_rows")
      .where("character_id", "=", characterId)
      .where("repeater_key", "=", input.repeaterKey)
      .select("id").execute();
    const existingIds = rows.map((row) => row.id);
    if (existingIds.length !== input.rowIds.length ||
        new Set(existingIds).size !== new Set(input.rowIds).size ||
        existingIds.some((id) => !input.rowIds.includes(id))) {
      throw new AppError("INVALID_REORDER", 400, "Reorder must contain every row in this repeater exactly once.");
    }

    await this.db.transaction().execute(async (trx) => {
      for (let i = 0; i < input.rowIds.length; i++) {
        await trx
          .updateTable("character_repeater_rows")
          .set({
            position: i,
            updated_by: userId,
            updated_at: sql`now()`,
          })
          .where("id", "=", input.rowIds[i])
          .where("character_id", "=", characterId)
          .where("repeater_key", "=", input.repeaterKey)
          .execute();
      }

      await trx
        .insertInto("character_repeater_mutations")
        .values({
          character_id: characterId,
          client_mutation_id: input.clientMutationId,
          repeater_key: input.repeaterKey,
          action: "reorder",
          payload: JSON.stringify(input.rowIds),
          version: 1,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    });

    return { success: true };
  }

  private async getRow(
    characterId: string,
    rowId: string,
  ): Promise<CharacterRepeaterRow | null> {
    const row = await this.db
      .selectFrom("character_repeater_rows")
      .where("id", "=", rowId)
      .where("character_id", "=", characterId)
      .selectAll()
      .executeTakeFirst();

    if (!row) return null;

    const values = await this.db
      .selectFrom("character_repeater_values")
      .where("row_id", "=", rowId)
      .selectAll()
      .execute();

    const valObj: Record<string, RepeaterRowValue> = {};
    for (const v of values) {
      valObj[v.slot_id] = parseJsonValue(v.value);
    }

    return {
      id: row.id,
      characterId: row.character_id,
      repeaterKey: row.repeater_key,
      position: row.position,
      version: row.version,
      values: valObj,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
      updatedBy: row.updated_by,
    };
  }

  private async assertCharacterAccess(
    userId: string,
    characterId: string,
  ): Promise<void> {
    const char = await this.db
      .selectFrom("characters")
      .where("id", "=", characterId)
      .where("deleted_at", "is", null)
      .select(["id", "owner_id"])
      .executeTakeFirst();

    if (!char) {
      throw new AppError("CHARACTER_NOT_FOUND", 404, "Character not found.");
    }

    if (char.owner_id === userId) return;

    const member = await this.db
      .selectFrom("character_members")
      .where("character_id", "=", characterId)
      .where("user_id", "=", userId)
      .select("role")
      .executeTakeFirst();

    if (!member) {
      throw new AppError("FORBIDDEN", 403, "Access restricted.");
    }
  }
}
