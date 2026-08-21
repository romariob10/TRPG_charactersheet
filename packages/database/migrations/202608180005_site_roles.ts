import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("profiles")
    .addColumn("site_role", "text", (col) =>
      col
        .notNull()
        .defaultTo("user")
        .check(sql`site_role in ('admin', 'moderator', 'user')`),
    )
    .execute();

  // Backfill existing admins
  await sql`UPDATE profiles SET site_role = 'admin' WHERE is_admin = true`.execute(db);

  await db.schema
    .createIndex("profiles_site_role_idx")
    .on("profiles")
    .column("site_role")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("profiles_site_role_idx").ifExists().execute();
  await db.schema.alterTable("profiles").dropColumn("site_role").execute();
}
