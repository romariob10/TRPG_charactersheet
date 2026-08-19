import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "../src/db.js";
import { runMigrations } from "../src/migrate.js";
import { createTestDatabase, destroyTestDatabase } from "../src/testing.js";

const REPAIR_MIGRATION = "202608190001_repair_social_tables";

const REPAIRED_TABLES = [
  "admin_audit_events",
  "content_reports",
  "direct_conversations",
  "direct_messages",
  "post_bookmarks",
  "post_views",
  "template_reviews",
  "user_notifications",
  "user_restrictions",
];

describe("social table repair migration", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await destroyTestDatabase(testDb);
  });

  async function presentTables(): Promise<string[]> {
    const rows = await testDb.db
      .selectFrom("information_schema.tables")
      .select("table_name")
      .where("table_schema", "=", testDb.schema)
      .where("table_name", "in", REPAIRED_TABLES)
      .execute();
    return rows.map((row) => row.table_name).sort();
  }

  // Kysely refuses to run migrations out of order, so every record from the
  // repair migration onwards has to go for it to be replayed.
  async function forgetRepairMigration(): Promise<void> {
    await sql`
      delete from ${sql.id(testDb.schema, "kysely_migration")}
      where name >= ${REPAIR_MIGRATION}
    `.execute(testDb.db);
  }

  async function migrateAgain(): Promise<void> {
    const db = createDatabase(testDb.databaseUrl, {
      searchPath: `${testDb.schema},public`,
    });
    try {
      await runMigrations(db, { migrationTableSchema: testDb.schema });
    } finally {
      await db.destroy();
    }
  }

  it("re-creates tables that a ledger-only migration record left behind", async () => {
    for (const table of REPAIRED_TABLES) {
      await sql`drop table if exists ${sql.id(testDb.schema, table)} cascade`.execute(
        testDb.db,
      );
    }
    await forgetRepairMigration();
    expect(await presentTables()).toEqual([]);

    await migrateAgain();

    expect(await presentTables()).toEqual(REPAIRED_TABLES);
  });

  it("leaves an already consistent schema untouched", async () => {
    await forgetRepairMigration();

    await expect(migrateAgain()).resolves.toBeUndefined();

    expect(await presentTables()).toEqual(REPAIRED_TABLES);
  });
});
