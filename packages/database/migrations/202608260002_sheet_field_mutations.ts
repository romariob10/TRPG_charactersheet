import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("character_sheet_field_mutations")
    .addColumn("character_id", "uuid", (column) =>
      column.notNull().references("characters.id").onDelete("cascade"),
    )
    .addColumn("client_mutation_id", "uuid", (column) => column.notNull())
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("field_key", "text", (column) => column.notNull())
    .addColumn("value", "jsonb")
    .addColumn("version", "integer", (column) => column.notNull())
    .addColumn("revision", "bigint", (column) => column.notNull())
    .addColumn("overwritten_remote", "boolean", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(now()))
    .addPrimaryKeyConstraint("character_sheet_field_mutations_pk", [
      "character_id",
      "client_mutation_id",
    ])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("character_sheet_field_mutations").ifExists().execute();
}
