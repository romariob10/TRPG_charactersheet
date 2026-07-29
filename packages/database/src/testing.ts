import { randomUUID } from "node:crypto";
import { Kysely, sql } from "kysely";
import { createDatabase } from "./db.js";
import { runMigrations } from "./migrate.js";
import type { Database } from "./types.js";

interface InformationSchema {
  "information_schema.columns": {
    table_name: string;
    column_name: string;
    is_nullable: string;
    table_schema: string;
  };
  "information_schema.schemata": {
    schema_name: string;
  };
  "information_schema.tables": {
    table_name: string;
    table_schema: string;
  };
}

export interface TestDatabase {
  db: Kysely<Database & InformationSchema>;
  schema: string;
  databaseUrl: string;
}

export type MigrationRunner = typeof runMigrations;

export interface CreateTestDatabaseOptions {
  schema?: string;
  migrationRunner?: MigrationRunner;
}

function createSchemaName(): string {
  return `test_${randomUUID().replaceAll("-", "")}`;
}

function assertTestSchema(schema: string): void {
  if (!/^test_[a-f0-9]{32}$/.test(schema)) {
    throw new Error("Refusing to drop a non-test schema.");
  }
}

export async function createTestDatabase(options: CreateTestDatabaseOptions = {}): Promise<TestDatabase> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database integration tests.");
  }

  const schema = options.schema ?? createSchemaName();
  assertTestSchema(schema);
  const rootDb = createDatabase(databaseUrl);
  try {
    await sql`create schema ${sql.id(schema)}`.execute(rootDb);
  } finally {
    await rootDb.destroy();
  }

  const db = createDatabase(databaseUrl, { searchPath: `${schema},public` });
  try {
    await (options.migrationRunner ?? runMigrations)(db, { migrationTableSchema: schema });
  } catch (error) {
    assertTestSchema(schema);
    await db.destroy();
    const cleanupDb = createDatabase(databaseUrl);
    try {
      await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(cleanupDb);
    } finally {
      await cleanupDb.destroy();
    }
    throw error;
  }

  return {
    db: db as unknown as TestDatabase["db"],
    schema,
    databaseUrl,
  };
}

export async function destroyTestDatabase(testDb: TestDatabase): Promise<void> {
  assertTestSchema(testDb.schema);
  await testDb.db.destroy();

  const rootDb = createDatabase(testDb.databaseUrl);
  try {
    await sql`drop schema if exists ${sql.id(testDb.schema)} cascade`.execute(rootDb);
  } finally {
    await rootDb.destroy();
  }
}
