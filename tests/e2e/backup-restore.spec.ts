import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import {
  createCharacter,
  createUser,
  e2eDatabaseUrl,
  fieldByName,
  saveField,
} from "./helpers";

const execute = promisify(execFile);

test("backup and restore preserve database rows, PDF bytes, and checksums", async () => {
  const owner = await createUser("backup-owner");
  const character = await createCharacter(owner.api, "backup-restore");
  const field = fieldByName(character, "acceptance.name");
  await saveField(owner.api, character.id, field.id, "Backup sentinel");

  const root = await mkdtemp(path.join(tmpdir(), "mycharacter-e2e-backup-"));
  const backups = path.join(root, "backups");
  const restoredStorage = path.join(root, "restored-storage");
  await Promise.all([mkdir(backups), mkdir(restoredStorage)]);
  const databaseName = `acceptance_${crypto.randomUUID().replaceAll("-", "")}`;
  const restoredDatabaseUrl = replaceDatabaseName(
    e2eDatabaseUrl,
    databaseName,
  );

  try {
    const backup = await execute("sh", ["/app/scripts/backup.sh"], {
      env: {
        ...process.env,
        BACKUP_ROOT: backups,
        DATABASE_URL: e2eDatabaseUrl,
        STORAGE_ROOT: "/var/lib/mycharacter/pdfs",
      },
    });
    const backupPath = backup.stdout
      .trim()
      .match(/Backup completed: (.+)$/)?.[1];
    expect(backupPath, backup.stdout).toBeTruthy();

    await execute("createdb", [
      `--maintenance-db=${e2eDatabaseUrl}`,
      databaseName,
    ]);
    await execute("sh", ["/app/scripts/restore.sh"], {
      env: {
        ...process.env,
        BACKUP_PATH: backupPath!,
        DATABASE_URL: restoredDatabaseUrl,
        STORAGE_ROOT: restoredStorage,
      },
    });

    const restored = new Client({ connectionString: restoredDatabaseUrl });
    await restored.connect();
    try {
      const value = await restored.query<{ value: unknown; version: number }>(
        `select value, version
           from character_values
          where character_id = $1 and field_id = $2`,
        [character.id, field.id],
      );
      expect(value.rows).toEqual([
        { value: "Backup sentinel", version: 1 },
      ]);

      const file = await restored.query<{
        sha256: string;
        storage_key: string;
      }>(
        `select file.sha256, file.storage_key
           from pdf_templates template
           join object_files file on file.id = template.file_id
          where template.id = $1`,
        [character.templateId],
      );
      expect(file.rows).toHaveLength(1);
      const restoredBytes = await readFile(
        path.join(restoredStorage, file.rows[0]!.storage_key),
      );
      expect(createHash("sha256").update(restoredBytes).digest("hex")).toBe(
        file.rows[0]!.sha256,
      );
    } finally {
      await restored.end();
    }
  } finally {
    await execute(
      "dropdb",
      [`--maintenance-db=${e2eDatabaseUrl}`, "--if-exists", "--force", databaseName],
    ).catch(() => undefined);
    await rm(root, { force: true, recursive: true });
    await owner.api.dispose();
  }
});

function replaceDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
