import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("posts")
    .addColumn("views_count", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createTable("post_bookmarks")
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("post_id", "uuid", (col) =>
      col.notNull().references("posts.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addPrimaryKeyConstraint("post_bookmarks_pkey", ["user_id", "post_id"])
    .execute();

  await db.schema
    .createTable("post_views")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("post_id", "uuid", (col) =>
      col.notNull().references("posts.id").onDelete("cascade"),
    )
    .addColumn("viewer_id", "uuid", (col) =>
      col.references("users.id").onDelete("cascade"),
    )
    .addColumn("viewer_hash", "text")
    .addColumn("viewed_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .execute();

  await db.schema
    .createIndex("post_views_post_viewer_idx")
    .on("post_views")
    .columns(["post_id", "viewer_id"])
    .execute();

  await db.schema
    .createIndex("post_views_post_hash_idx")
    .on("post_views")
    .columns(["post_id", "viewer_hash"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("post_views").ifExists().execute();
  await db.schema.dropTable("post_bookmarks").ifExists().execute();
  await db.schema.alterTable("posts").dropColumn("views_count").execute();
}
