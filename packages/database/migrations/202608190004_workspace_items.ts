import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("workspace_items")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("target_id", "uuid", (col) => col.notNull())
    .addColumn("pinned", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("last_activity_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addColumn("last_seen_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addUniqueConstraint("workspace_items_user_kind_target_unique", [
      "user_id",
      "kind",
      "target_id",
    ])
    .execute();

  await db.schema
    .createIndex("workspace_items_user_order_idx")
    .on("workspace_items")
    .columns(["user_id", "pinned", "last_activity_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("workspace_items").ifExists().execute();
}
