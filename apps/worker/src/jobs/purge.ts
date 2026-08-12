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
        const candidates = await trx
          .selectFrom("pdf_templates as template")
          .innerJoin("object_files as file", "file.id", "template.file_id")
          .select(["file.id", "file.storage_key as storageKey"])
          .where("template.deleted_at", "<", cutoff)
          .where("file.state", "in", ["ready", "deleting"])
          // Serialize final purge with upload/manual restore, both of which
          // lock the template row before making it active again.
          .forUpdate()
          .execute();
        if (!candidates.length) return [];
        // A concurrent re-upload may restore the template between the select
        // above and this update; only purge files whose template is still in
        // the trash, and only report rows that were actually marked.
        return trx
          .updateTable("object_files")
          .set({ state: "deleting" })
          .where(
            "id",
            "in",
            candidates.map((file) => file.id),
          )
          .where("id", "in", (eb) =>
            eb
              .selectFrom("pdf_templates")
              .select("file_id")
              .where("deleted_at", "<", cutoff),
          )
          .returning(["id", "storage_key as storageKey"])
          .execute();
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
