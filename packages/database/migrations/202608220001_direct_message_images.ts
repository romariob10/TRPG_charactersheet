import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("direct_message_images")
    .addColumn("file_id", "uuid", (col) =>
      col.primaryKey().references("object_files.id").onDelete("cascade"),
    )
    .addColumn("conversation_id", "uuid", (col) =>
      col
        .notNull()
        .references("direct_conversations.id")
        .onDelete("cascade"),
    )
    .addColumn("uploader_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(now()),
    )
    .execute();

  await db.schema
    .createIndex("direct_message_images_conversation_idx")
    .on("direct_message_images")
    .columns(["conversation_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("direct_message_images").ifExists().execute();
}
