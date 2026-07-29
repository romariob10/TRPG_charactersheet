import { FileMigrationProvider, Kysely, Migrator, sql } from "kysely";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Database } from "./types.js";

const bundledMigrationFolder = fileURLToPath(new URL("./migrations", import.meta.url));
const sourceMigrationFolder = fileURLToPath(new URL("../migrations", import.meta.url));

export function getMigrationFolder(): string {
  return existsSync(bundledMigrationFolder) ? bundledMigrationFolder : sourceMigrationFolder;
}

export interface RunMigrationsOptions {
  migrationTableSchema?: string;
}

export async function ensureDatabasePrerequisites(db: Kysely<Database>): Promise<void> {
  await sql`create extension if not exists pgcrypto with schema public`.execute(db);
  await sql`create extension if not exists pg_trgm with schema public`.execute(db);

  const extensions = await sql<{ extname: string; schema_name: string }>`
    select extension.extname, namespace.nspname as schema_name
    from pg_extension as extension
    join pg_namespace as namespace on namespace.oid = extension.extnamespace
    where extension.extname in ('pgcrypto', 'pg_trgm')
  `.execute(db);
  if (extensions.rows.some((extension) => extension.schema_name !== "public")) {
    throw new Error("pgcrypto and pg_trgm must be installed in the public schema.");
  }
}

export async function runMigrations(db: Kysely<Database>, options: RunMigrationsOptions = {}): Promise<void> {
  await ensureDatabasePrerequisites(db);
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: getMigrationFolder() }),
    migrationTableSchema: options.migrationTableSchema,
  });
  const { error } = await migrator.migrateToLatest();

  if (error) {
    throw error;
  }
}
