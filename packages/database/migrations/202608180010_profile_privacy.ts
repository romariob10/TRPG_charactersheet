import { Kysely } from "kysely";
import type { Database } from "../src/types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("profiles")
    .addColumn("allow_comments", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("show_characters", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("show_templates", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("show_activity", "boolean", (col) => col.notNull().defaultTo(true))
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("profiles")
    .dropColumn("allow_comments")
    .dropColumn("show_characters")
    .dropColumn("show_templates")
    .dropColumn("show_activity")
    .execute();
}
