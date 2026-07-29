import type { Database } from "@mycharacter/database";
import type { ObjectStorage } from "@mycharacter/storage";
import type { Kysely } from "kysely";

export interface PurgeDependencies {
  markEligibleFilesDeleting: (
    cutoff: Date,
  ) => Promise<Array<{ id: string; storageKey: string }>>;
  deleteObject: (storageKey: string) => Promise<void>;
  removePurgedMetadata: (fileId: string, cutoff: Date) => Promise<void>;
}

export async function purgeTrash(
  dependencies: PurgeDependencies,
  cutoff = new Date(Date.now() - 30 * 86_400_000),
): Promise<{ files: number }> {
  const files = await dependencies.markEligibleFilesDeleting(cutoff);
  for (const file of files) {
    await dependencies.deleteObject(file.storageKey);
    await dependencies.removePurgedMetadata(file.id, cutoff);
  }
  return { files: files.length };
}

export function createPurgeDependencies(
  db: Kysely<Database>,
  storage: ObjectStorage,
): PurgeDependencies {
  return {
    markEligibleFilesDeleting: async (cutoff) =>
      db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("characters")
          .where("status", "=", "trashed")
          .where("deleted_at", "<", cutoff)
          .execute();
        const files = await trx
          .selectFrom("pdf_templates as template")
          .innerJoin("object_files as file", "file.id", "template.file_id")
          .select(["file.id", "file.storage_key as storageKey"])
          .where("template.deleted_at", "<", cutoff)
          .where("file.state", "in", ["ready", "deleting"])
          .execute();
        if (files.length) {
          await trx
            .updateTable("object_files")
            .set({ state: "deleting" })
            .where(
              "id",
              "in",
              files.map((file) => file.id),
            )
            .execute();
        }
        return files;
      }),
    deleteObject: (storageKey) => storage.delete(storageKey),
    removePurgedMetadata: (fileId, cutoff) =>
      db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("pdf_templates")
          .where("file_id", "=", fileId)
          .where("deleted_at", "<", cutoff)
          .execute();
        await trx
          .deleteFrom("object_files")
          .where("id", "=", fileId)
          .where("state", "=", "deleting")
          .execute();
      }),
  };
}
