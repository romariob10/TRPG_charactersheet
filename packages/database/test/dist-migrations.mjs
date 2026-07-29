import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sql } from "kysely";
import { createDatabase, getMigrationFolder, runMigrations } from "@mycharacter/database";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for dist migration coverage.");
}

const schema = `test_${randomUUID().replaceAll("-", "")}`;
const bundledMigrationFolder = fileURLToPath(new URL("../dist/migrations", import.meta.url));
if (getMigrationFolder() !== bundledMigrationFolder) {
  throw new Error("The built package did not select its bundled migrations.");
}
await access(new URL("../dist/migrations/202607270001_initial.js", import.meta.url));
await access(new URL("../dist/migrations/202607270002_indexes.js", import.meta.url));
const rootDb = createDatabase(databaseUrl);
let db;

try {
  await sql`create schema ${sql.id(schema)}`.execute(rootDb);
  db = createDatabase(databaseUrl, { searchPath: `${schema},public` });
  await runMigrations(db);

  const rows = await sql`
    select table_name
    from information_schema.tables
    where table_schema = ${schema} and table_name in ('users', 'characters', 'ai_messages')
    order by table_name
  `.execute(db);
  if (rows.rows.map((row) => row.table_name).join(",") !== "ai_messages,characters,users") {
    throw new Error("The built package did not apply both database migrations.");
  }
} finally {
  await db?.destroy();
  await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(rootDb);
  await rootDb.destroy();
}
