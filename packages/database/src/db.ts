import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./types.js";

export interface DatabaseOptions {
  searchPath?: string;
}

export function createDatabase(databaseUrl: string, options: DatabaseOptions = {}): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: databaseUrl,
        options: options.searchPath ? `-c search_path=${options.searchPath}` : undefined,
      }),
    }),
  });
}
