import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("pdf_templates")
    .addColumn("tags", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn("genre", "text")
    .addColumn("complexity", "text")
    .addColumn("rating_average", sql`numeric(3, 2)`, (col) => col.notNull().defaultTo(0))
    .addColumn("rating_count", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createTable("template_reviews")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("template_id", "uuid", (col) =>
      col.notNull().references("pdf_templates.id").onDelete("cascade"),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("rating", "smallint", (col) => col.notNull())
    .addColumn("title", "text")
    .addColumn("body", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addUniqueConstraint("template_reviews_template_user_unique", [
      "template_id",
      "user_id",
    ])
    .execute();

  await db.schema
    .createIndex("template_reviews_template_idx")
    .on("template_reviews")
    .columns(["template_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("template_reviews").ifExists().execute();
  await db.schema
    .alterTable("pdf_templates")
    .dropColumn("tags")
    .dropColumn("genre")
    .dropColumn("complexity")
    .dropColumn("rating_average")
    .dropColumn("rating_count")
    .execute();
}
