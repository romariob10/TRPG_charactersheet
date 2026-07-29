import type { Database } from "@mycharacter/database";
import type { ObjectStorage } from "@mycharacter/storage";
import { StorageError } from "@mycharacter/storage";
import type { Kysely } from "kysely";

export interface ReconciliationReport {
  removedPending: number;
  missingLive: Array<{ fileId: string; storageKey: string }>;
}

export async function reconcileStorage(
  db: Kysely<Database>,
  storage: ObjectStorage,
  cutoff = new Date(Date.now() - 60 * 60 * 1_000),
): Promise<ReconciliationReport> {
  const pending = await db
    .selectFrom("object_files")
    .select(["id", "storage_key as storageKey"])
    .where("state", "=", "pending")
    .where("created_at", "<", cutoff)
    .execute();
  let removedPending = 0;
  for (const file of pending) {
    await storage.delete(file.storageKey);
    const result = await db
      .deleteFrom("object_files")
      .where("id", "=", file.id)
      .where("state", "=", "pending")
      .executeTakeFirst();
    if (Number(result.numDeletedRows) > 0) removedPending += 1;
  }

  const live = await db
    .selectFrom("object_files")
    .select(["id", "storage_key as storageKey"])
    .where("state", "=", "ready")
    .execute();
  const missingLive: ReconciliationReport["missingLive"] = [];
  for (const file of live) {
    try {
      await storage.stat(file.storageKey);
    } catch (error) {
      if (
        error instanceof StorageError &&
        error.code === "STORAGE_NOT_FOUND"
      ) {
        missingLive.push({ fileId: file.id, storageKey: file.storageKey });
        continue;
      }
      throw error;
    }
  }
  return { removedPending, missingLive };
}
