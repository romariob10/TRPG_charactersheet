import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "../src/db.js";
import { createTestDatabase, destroyTestDatabase } from "../src/testing.js";
import { up as repairSocialTables } from "../migrations/202608190001_repair_social_tables.js";

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

  async function applyRepairMigration(): Promise<void> {
    const db = createDatabase(testDb.databaseUrl, {
      searchPath: `${testDb.schema},public`,
    });
    try {
      await repairSocialTables(db);
    } finally {
      await db.destroy();
    }
  }

  it("re-creates tables missing from a legacy schema", async () => {
    for (const table of REPAIRED_TABLES) {
      await sql`drop table if exists ${sql.id(testDb.schema, table)} cascade`.execute(
        testDb.db,
      );
    }
    expect(await presentTables()).toEqual([]);

    await applyRepairMigration();

    expect(await presentTables()).toEqual(REPAIRED_TABLES);
  });

  it("leaves an already consistent schema untouched", async () => {
    await expect(applyRepairMigration()).resolves.toBeUndefined();

    expect(await presentTables()).toEqual(REPAIRED_TABLES);
  });
});
