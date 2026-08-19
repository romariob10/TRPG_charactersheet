import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("user_restrictions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("moderator_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("expires_at", "timestamptz")
    .addColumn("revoked_at", "timestamptz")
    .addColumn("revoked_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("revocation_reason", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createIndex("user_restrictions_active_idx")
    .on("user_restrictions")
    .columns(["user_id", "action", "expires_at", "revoked_at"])
    .execute();

  await db.schema
    .createIndex("user_restrictions_created_idx")
    .on("user_restrictions")
    .column("created_at")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("user_restrictions").ifExists().execute();
}
