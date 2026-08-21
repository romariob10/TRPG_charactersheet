import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

const uuid = () => sql`gen_random_uuid()`;
const now = () => sql`now()`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("direct_conversations")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("participant_one_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("participant_two_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("last_message_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .addUniqueConstraint("direct_conversations_participants_unique", [
      "participant_one_id",
      "participant_two_id",
    ])
    .execute();

  await db.schema
    .createTable("direct_messages")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuid()))
    .addColumn("conversation_id", "uuid", (col) =>
      col.notNull().references("direct_conversations.id").onDelete("cascade"),
    )
    .addColumn("sender_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("read_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now()))
    .execute();

  await db.schema
    .createIndex("direct_messages_conversation_idx")
    .on("direct_messages")
    .columns(["conversation_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("direct_messages").ifExists().execute();
  await db.schema.dropTable("direct_conversations").ifExists().execute();
}
