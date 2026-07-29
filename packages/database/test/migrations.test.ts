import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createDatabase } from "../src/db.js";
import { createTestDatabase, destroyTestDatabase } from "../src/testing.js";

describe("initial migration", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    const { databaseUrl, schema } = testDb;
    await destroyTestDatabase(testDb);

    const rootDb = createDatabase(databaseUrl);
    try {
      const row = await sql<{ schema_name: string }>`
        select schema_name from information_schema.schemata where schema_name = ${schema}
      `.execute(rootDb);
      expect(row.rows).toHaveLength(0);
    } finally {
      await rootDb.destroy();
    }
  });

  it("creates the final local auth and character tables", async () => {
    const rows = await testDb.db
      .selectFrom("information_schema.tables")
      .select("table_name")
      .where("table_schema", "=", testDb.schema)
      .execute();
    const names = rows.map((row) => row.table_name);

    expect(names).toEqual(
      expect.arrayContaining([
        "users",
        "profiles",
        "sessions",
        "auth_tokens",
        "object_files",
        "pdf_templates",
        "pdf_fields",
        "pdf_field_widgets",
        "template_subscriptions",
        "characters",
        "character_members",
        "character_values",
        "character_mutations",
        "character_invites",
        "catalog_jobs",
        "ai_threads",
        "ai_messages",
        "ai_proposals",
        "ai_proposal_items",
      ]),
    );
    expect(names).not.toContain("field_catalog_overrides");
    expect(names).not.toContain("template_field_settings");
  });

  it("preserves final template, message, and storage columns", async () => {
    const rows = await testDb.db
      .selectFrom("information_schema.columns")
      .select(["table_name", "column_name", "is_nullable"])
      .where("table_schema", "=", testDb.schema)
      .where("table_name", "in", ["pdf_templates", "pdf_fields", "ai_messages"])
      .execute();
    const columns = new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));

    expect(columns.get("pdf_templates.file_id")?.is_nullable).toBe("NO");
    expect(columns.get("pdf_templates.catalog_approved_at")).toBeDefined();
    expect(columns.get("pdf_templates.catalog_approved_by")).toBeDefined();
    expect(columns.get("pdf_templates.deleted_at")).toBeDefined();
    expect(columns.get("pdf_fields.is_enabled")?.is_nullable).toBe("NO");
    expect(columns.get("ai_messages.sequence_index")?.is_nullable).toBe("NO");
  });

  it("exposes final template field mappings through effective_pdf_fields", async () => {
    const user = await testDb.db
      .insertInto("users")
      .values({ email: "view@example.com", password_hash: "hash" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const objectFile = await testDb.db
      .insertInto("object_files")
      .values({ storage_key: "view.pdf", sha256: "a".repeat(64), size_bytes: "1", media_type: "application/pdf" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const template = await testDb.db
      .insertInto("pdf_templates")
      .values({
        file_id: objectFile.id,
        owner_id: user.id,
        title: "View template",
        storage_path: "view.pdf",
        sha256: "a".repeat(64),
        page_count: 1,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const groupId = randomUUID();
    const field = await testDb.db
      .insertInto("pdf_fields")
      .values({
        template_id: template.id,
        pdf_name: "strength",
        kind: "text",
        auto_label: "Strength",
        auto_aliases: ["str"],
        auto_section: "Abilities",
        page: 1,
        auto_group_id: groupId,
        auto_group_order: 2,
        confidence: 0.8,
        source: "manual",
        is_enabled: false,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const row = await sql<{
      label: string;
      aliases: string[];
      section: string | null;
      group_id: string | null;
      group_order: number | null;
      confidence: number;
      source: string;
      is_enabled: boolean;
    }>`
      select label, aliases, section, group_id, group_order, confidence, source, is_enabled
      from effective_pdf_fields
      where id = ${field.id}
    `.execute(testDb.db);

    expect(row.rows).toEqual([
      {
        label: "Strength",
        aliases: ["str"],
        section: "Abilities",
        group_id: groupId,
        group_order: 2,
        confidence: 0.8,
        source: "manual",
        is_enabled: false,
      },
    ]);
  });

  it("uses public extensions across sequential isolated schemas", async () => {
    const first = await createTestDatabase();
    await destroyTestDatabase(first);
    const second = await createTestDatabase();
    await destroyTestDatabase(second);

    const rootDb = createDatabase(testDb.databaseUrl);
    try {
      const extensions = await sql<{ extname: string; schema_name: string }>`
        select extension.extname, namespace.nspname as schema_name
        from pg_extension as extension
        join pg_namespace as namespace on namespace.oid = extension.extnamespace
        where extension.extname in ('pgcrypto', 'pg_trgm')
        order by extension.extname
      `.execute(rootDb);
      expect(extensions.rows).toEqual([
        { extname: "pg_trgm", schema_name: "public" },
        { extname: "pgcrypto", schema_name: "public" },
      ]);
    } finally {
      await rootDb.destroy();
    }
  });

  it("removes only the generated schema after a forced migration failure", async () => {
    const failedSchema = `test_${randomUUID().replaceAll("-", "")}`;
    const untouchedSchema = `keep_${randomUUID().replaceAll("-", "")}`;
    const rootDb = createDatabase(testDb.databaseUrl);
    await sql`create schema ${sql.id(untouchedSchema)}`.execute(rootDb);

    try {
      await expect(
        createTestDatabase({
          schema: failedSchema,
          migrationRunner: async () => {
            throw new Error("forced migration failure");
          },
        }),
      ).rejects.toThrow("forced migration failure");

      const schemas = await sql<{ schema_name: string }>`
        select schema_name
        from information_schema.schemata
        where schema_name in (${failedSchema}, ${untouchedSchema})
        order by schema_name
      `.execute(rootDb);
      expect(schemas.rows).toEqual([{ schema_name: untouchedSchema }]);
    } finally {
      await sql`drop schema if exists ${sql.id(untouchedSchema)} cascade`.execute(rootDb);
      await rootDb.destroy();
    }
  });

});
