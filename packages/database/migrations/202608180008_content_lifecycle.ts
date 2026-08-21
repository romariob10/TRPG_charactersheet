import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("posts")
    .addColumn("is_hidden", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("deleted_at", "timestamptz")
    .execute();

  await db.schema
    .alterTable("post_comments")
    .addColumn("deleted_at", "timestamptz")
    .execute();

  await db.schema
    .createIndex("posts_active_idx")
    .on("posts")
    .columns(["is_hidden", "deleted_at", "published_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("posts").dropColumn("is_hidden").dropColumn("deleted_at").execute();
  await db.schema.alterTable("post_comments").dropColumn("deleted_at").execute();
}
