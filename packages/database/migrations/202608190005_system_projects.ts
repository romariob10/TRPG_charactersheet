import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

// Systems become project workspaces: they collect reference materials and the
// posts filed under them, in addition to the characters they already own
// through characters.template_id.
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("system_materials")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("template_id", "uuid", (col) =>
      col.notNull().references("pdf_templates.id").onDelete("cascade"),
    )
    .addColumn("uploader_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("storage_path", "text", (col) => col.notNull())
    .addColumn("file_type", "text", (col) => col.notNull())
    .addColumn("size_bytes", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createIndex("system_materials_template_idx")
    .on("system_materials")
    .columns(["template_id", "created_at"])
    .execute();

  await db.schema
    .alterTable("posts")
    .addColumn("system_id", "uuid", (col) =>
      col.references("pdf_templates.id").onDelete("set null"),
    )
    .execute();

  await db.schema
    .createIndex("posts_system_idx")
    .on("posts")
    .column("system_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("posts_system_idx").ifExists().execute();
  await db.schema.alterTable("posts").dropColumn("system_id").execute();
  await db.schema.dropTable("system_materials").ifExists().execute();
}
