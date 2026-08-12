import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("template_likes")
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("template_id", "uuid", (col) =>
      col.notNull().references("pdf_templates.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("template_likes_pkey", ["user_id", "template_id"])
    .execute();
  await sql`
    create index template_likes_template_idx
    on template_likes(template_id, created_at desc)
  `.execute(db);

  await db.schema
    .createTable("template_comments")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("template_id", "uuid", (col) =>
      col.notNull().references("pdf_templates.id").onDelete("cascade"),
    )
    .addColumn("author_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "template_comments_body_check",
      sql`char_length(btrim(body)) between 1 and 2000`,
    )
    .execute();
  await sql`
    create index template_comments_template_idx
    on template_comments(template_id, created_at desc, id desc)
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("template_comments").ifExists().execute();
  await db.schema.dropTable("template_likes").ifExists().execute();
}
