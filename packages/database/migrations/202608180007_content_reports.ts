import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("content_reports")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("reporter_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("target_type", "text", (col) => col.notNull())
    .addColumn("target_id", "text", (col) => col.notNull())
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("details", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("moderator_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("resolution_note", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("resolved_at", "timestamptz")
    .execute();

  await db.schema
    .createIndex("content_reports_status_created_idx")
    .on("content_reports")
    .columns(["status", "created_at"])
    .execute();

  await db.schema
    .createIndex("content_reports_target_idx")
    .on("content_reports")
    .columns(["target_type", "target_id"])
    .execute();

  await db.schema
    .createIndex("content_reports_reporter_idx")
    .on("content_reports")
    .columns(["reporter_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("content_reports").ifExists().execute();
}
