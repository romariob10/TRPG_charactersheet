import { createDatabase } from "@mycharacter/database";
import type { Database } from "@mycharacter/database";
import "fastify";
import type { FastifyInstance as AppInstance } from "fastify";
import type { Kysely } from "kysely";

declare module "fastify" {
  // eslint-disable-next-line no-unused-vars -- TypeScript merges this interface into FastifyInstance.
  interface FastifyInstance {
    db: Kysely<Database>;
  }
}

export interface DatabaseOptions {
  database?: Kysely<Database>;
  databaseUrl: string;
}

export async function registerDatabase(
  app: AppInstance,
  options: DatabaseOptions,
): Promise<void> {
  const db = options.database ?? createDatabase(options.databaseUrl);
  app.decorate("db", db);

  if (!options.database) {
    app.addHook("onClose", async () => {
      await db.destroy();
    });
  }
}
