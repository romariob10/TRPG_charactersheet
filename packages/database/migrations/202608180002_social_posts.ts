import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("posts")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("author_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("title", "text")
    .addColumn("content", "jsonb", (col) => col.notNull())
    .addColumn("plain_text", "text", (col) => col.notNull())
    .addColumn("published_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addUniqueConstraint("posts_author_slug_key", ["author_id", "slug"])
    .addCheckConstraint(
      "posts_slug_check",
      sql`slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    )
    .addCheckConstraint(
      "posts_title_length_check",
      sql`title is null or char_length(title) between 1 and 160`,
    )
    .addCheckConstraint(
      "posts_plain_text_length_check",
      sql`char_length(plain_text) between 1 and 100000`,
    )
    .execute();

  await db.schema
    .createTable("post_images")
    .addColumn("file_id", "uuid", (col) =>
      col.primaryKey().references("object_files.id").onDelete("cascade"),
    )
    .addColumn("uploader_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("post_id", "uuid", (col) =>
      col.references("posts.id").onDelete("cascade"),
    )
    .addColumn("width", "integer")
    .addColumn("height", "integer")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .execute();

  await db.schema
    .createTable("post_reactions")
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("post_id", "uuid", (col) =>
      col.notNull().references("posts.id").onDelete("cascade"),
    )
    .addColumn("reaction", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addPrimaryKeyConstraint("post_reactions_pkey", [
      "user_id",
      "post_id",
      "reaction",
    ])
    .addCheckConstraint(
      "post_reactions_kind_check",
      sql`reaction in ('like', 'fire', 'dice')`,
    )
    .execute();

  await db.schema
    .createTable("post_comments")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("post_id", "uuid", (col) =>
      col.notNull().references("posts.id").onDelete("cascade"),
    )
    .addColumn("author_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .addCheckConstraint(
      "post_comments_body_length_check",
      sql`char_length(body) between 1 and 2000`,
    )
    .execute();

  await db.schema
    .createIndex("posts_published_at_idx")
    .on("posts")
    .column("published_at")
    .execute();
  await db.schema
    .createIndex("post_comments_post_created_idx")
    .on("post_comments")
    .columns(["post_id", "created_at"])
    .execute();
  await db.schema
    .createIndex("post_images_post_idx")
    .on("post_images")
    .column("post_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("post_comments").ifExists().execute();
  await db.schema.dropTable("post_reactions").ifExists().execute();
  await db.schema.dropTable("post_images").ifExists().execute();
  await db.schema.dropTable("posts").ifExists().execute();
}
