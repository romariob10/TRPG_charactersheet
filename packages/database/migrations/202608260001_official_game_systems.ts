import { Kysely, sql } from "kysely";
import type { Database } from "../src/types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("game_systems")
    .addColumn("is_official", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .execute();

  await db.schema
    .alterTable("game_systems")
    .addCheckConstraint(
      "game_systems_official_public_check",
      sql`not is_official or visibility = 'public'`,
    )
    .execute();

  await db.schema
    .createIndex("game_systems_official_idx")
    .on("game_systems")
    .column("updated_at")
    .where(sql<boolean>`is_official`)
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("game_systems_official_idx").ifExists().execute();
  await db.schema
    .alterTable("game_systems")
    .dropConstraint("game_systems_official_public_check")
    .execute();
  await db.schema.alterTable("game_systems").dropColumn("is_official").execute();
}
