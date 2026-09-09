import { sql, type Kysely } from "kysely";
import type { Database } from "../src/types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("agent_tokens")
    .addColumn("id", "uuid", (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (c) =>
      c.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("prefix", "text", (c) => c.notNull())
    .addColumn("token_hash", "text", (c) => c.notNull().unique())
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn("expires_at", "timestamptz", (c) => c.notNull())
    .addColumn("last_used_at", "timestamptz")
    .addColumn("presence", "jsonb")
    .addColumn("presence_at", "timestamptz")
    .addCheckConstraint(
      "agent_tokens_name_length",
      sql`length(name) between 1 and 60`,
    )
    .execute();
  await db.schema
    .createIndex("agent_tokens_user_idx")
    .on("agent_tokens")
    .column("user_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("agent_tokens").execute();
}
