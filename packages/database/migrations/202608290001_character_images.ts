import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("character_images")
    .addColumn("file_id", "uuid", (col) =>
      col.primaryKey().references("object_files.id").onDelete("cascade"),
    )
    .addColumn("character_id", "uuid", (col) =>
      col.notNull().references("characters.id").onDelete("cascade"),
    )
    .addColumn("field_key", "text", (col) => col.notNull())
    .addColumn("uploader_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("character_images_field_unique", [
      "character_id",
      "field_key",
    ])
    .execute();

  await db.schema
    .createIndex("character_images_character_idx")
    .on("character_images")
    .columns(["character_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("character_images").ifExists().execute();
}
