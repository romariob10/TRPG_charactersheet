import {
  catalogJobPayloadSchema,
  JOB_NAMES,
  type CatalogJobPayload,
} from "@mycharacter/contracts";
import { createDatabase } from "@mycharacter/database";
import {
  createConfiguredStorage,
  FileAiSettingsStore,
} from "@mycharacter/storage";
import { PgBoss } from "pg-boss";
import {
  createCatalogDependencies,
  markCatalogFailed,
  processCatalogJob,
} from "./jobs/catalog.js";
import { createPurgeDependencies, purgeTrash } from "./jobs/purge.js";
import { reconcileStorage } from "./jobs/reconcile-storage.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const db = createDatabase(databaseUrl);
const storageRoot = process.env.STORAGE_ROOT ?? "/var/lib/mycharacter/pdfs";
const storage = createConfiguredStorage(process.env, storageRoot);
const aiSettings = new FileAiSettingsStore(storageRoot);
const boss = new PgBoss({
  connectionString: databaseUrl,
  useListenNotify: true,
});
boss.on("error", () => console.error("worker queue error"));

await boss.start();
await Promise.all([
  boss.createQueue(JOB_NAMES.catalogTemplate, {
    policy: "short",
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    retryDelayMax: 300,
    expireInSeconds: 1_800,
    heartbeatSeconds: 60,
    retentionSeconds: 86_400,
    deleteAfterSeconds: 86_400,
    notify: true,
  }),
  boss.createQueue(JOB_NAMES.purgeTrash, {
    policy: "short",
    retryLimit: 2,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 900,
    notify: true,
  }),
  boss.createQueue(JOB_NAMES.reconcileStorage, {
    policy: "short",
    retryLimit: 2,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 900,
    notify: true,
  }),
]);
await boss.schedule(
  JOB_NAMES.purgeTrash,
  "0 3 * * *",
  {},
  { tz: "UTC", singletonKey: JOB_NAMES.purgeTrash },
);
await boss.schedule(
  JOB_NAMES.reconcileStorage,
  "0 * * * *",
  {},
  { tz: "UTC", singletonKey: JOB_NAMES.reconcileStorage },
);

const catalogDependencies = createCatalogDependencies(
  db,
  storage,
  process.env,
  aiSettings,
);
const purgeDependencies = createPurgeDependencies(db, storage);

await boss.work<CatalogJobPayload>(
  JOB_NAMES.catalogTemplate,
  { batchSize: 1, localConcurrency: 2, pollingIntervalSeconds: 2 },
  async ([job]) => {
    const payload = catalogJobPayloadSchema.parse(job.data);
    try {
      return await processCatalogJob(payload, catalogDependencies);
    } catch (error) {
      await markCatalogFailed(db, payload, error);
      throw error;
    }
  },
);
await boss.work(
  JOB_NAMES.purgeTrash,
  { batchSize: 1, localConcurrency: 1 },
  async () => {
    const result = await purgeTrash(purgeDependencies);
    console.info("trash purge complete", result);
    return result;
  },
);
await boss.work(
  JOB_NAMES.reconcileStorage,
  { batchSize: 1, localConcurrency: 1 },
  async () => {
    const result = await reconcileStorage(db, storage);
    console.info("storage reconciliation complete", {
      removedPending: result.removedPending,
      missingLiveCount: result.missingLive.length,
      missingLiveFileIds: result.missingLive.map((file) => file.fileId),
    });
    return result;
  },
);

console.info("local background worker ready");

let closing = false;
async function close(): Promise<void> {
  if (closing) return;
  closing = true;
  await boss.stop({ graceful: true, timeout: 30_000 });
  await db.destroy();
}

process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
