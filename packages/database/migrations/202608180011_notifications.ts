import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("user_notifications")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("actor_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("target_type", "text")
    .addColumn("target_id", "text")
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("body", "text")
    .addColumn("metadata", "jsonb", (col) => col.notNull().defaultTo(sql`{}::jsonb`))
    .addColumn("read_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createIndex("user_notifications_user_unread_idx")
    .on("user_notifications")
    .columns(["user_id", "read_at", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("user_notifications").ifExists().execute();
}
