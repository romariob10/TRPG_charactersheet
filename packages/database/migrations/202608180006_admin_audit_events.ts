import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("admin_audit_events")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("actor_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("actor_role", "text", (col) => col.notNull())
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("target_type", "text", (col) => col.notNull())
    .addColumn("target_id", "text")
    .addColumn("reason", "text")
    .addColumn("metadata", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("request_id", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createIndex("admin_audit_created_at_idx")
    .on("admin_audit_events")
    .column("created_at")
    .execute();

  await db.schema
    .createIndex("admin_audit_target_idx")
    .on("admin_audit_events")
    .columns(["target_type", "target_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("admin_audit_actor_idx")
    .on("admin_audit_events")
    .columns(["actor_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("admin_audit_events").ifExists().execute();
}
