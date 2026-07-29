import type { CatalogJobPayload } from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Transaction } from "kysely";
import { fromKysely, PgBoss } from "pg-boss";
import { JOB_NAMES } from "./names.js";
import "fastify";

/* eslint-disable no-unused-vars -- Module augmentation and interface parameter names document contracts. */
declare module "fastify" {
  interface FastifyInstance {
    jobs: JobClient;
  }
}

export interface JobClient {
  enqueueCatalog(
    transaction: Transaction<Database>,
    payload: CatalogJobPayload,
  ): Promise<string | null>;
  stop(): Promise<void>;
}
/* eslint-enable no-unused-vars */

export const queueOptions = {
  retryLimit: 3,
  retryDelay: 5,
  retryBackoff: true,
  retryDelayMax: 300,
  expireInSeconds: 1_800,
  heartbeatSeconds: 60,
  retentionSeconds: 86_400,
  deleteAfterSeconds: 86_400,
  policy: "short",
  notify: true,
} as const;

export async function createJobClient(databaseUrl: string): Promise<JobClient> {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    useListenNotify: true,
  });
  boss.on("error", () => console.error("job queue error"));
  await boss.start();
  await Promise.all([
    boss.createQueue(JOB_NAMES.catalogTemplate, queueOptions),
    boss.createQueue(JOB_NAMES.purgeTrash, {
      ...queueOptions,
      retryLimit: 2,
      expireInSeconds: 900,
    }),
    boss.createQueue(JOB_NAMES.reconcileStorage, {
      ...queueOptions,
      retryLimit: 2,
      expireInSeconds: 900,
    }),
  ]);

  return {
    enqueueCatalog: (transaction, payload) =>
      boss.send(JOB_NAMES.catalogTemplate, payload, {
        db: fromKysely(transaction),
        singletonKey: payload.templateId,
      }),
    stop: () => boss.stop({ graceful: true, timeout: 30_000 }),
  };
}

export function createNoopJobClient(): JobClient {
  return {
    enqueueCatalog: async () => null,
    stop: async () => undefined,
  };
}
