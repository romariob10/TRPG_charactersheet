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
await access(new URL("../dist/migrations/202608180002_social_posts.js", import.meta.url));
await access(new URL("../dist/migrations/202608180013_template_reviews.js", import.meta.url));
const rootDb = createDatabase(databaseUrl);
let db;

try {
  await sql`create schema ${sql.id(schema)}`.execute(rootDb);
  db = createDatabase(databaseUrl, { searchPath: `${schema},public` });
  await runMigrations(db, { migrationTableSchema: schema });

  const rows = await sql`
    select table_name
    from information_schema.tables
    where table_schema = ${schema}
      and table_name in ('users', 'characters', 'ai_messages', 'posts', 'user_notifications', 'template_reviews')
    order by table_name
  `.execute(db);
  const actualTables = rows.rows.map((row) => row.table_name).join(",");
  const expectedTables =
    "ai_messages,characters,posts,template_reviews,user_notifications,users";
  if (actualTables !== expectedTables) {
    throw new Error(
      `The built package did not apply every database migration. Expected ${expectedTables}; received ${actualTables}.`,
    );
  }
} finally {
  await db?.destroy();
  await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(rootDb);
  await rootDb.destroy();
}
