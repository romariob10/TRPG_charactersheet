import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Client } from "pg";
import { createDatabase, runMigrations } from "@mycharacter/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const adminDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://mycharacter:mycharacter@postgres:5432/mycharacter";
const suffix = randomUUID().replaceAll("-", "");
const sourceName = `backup_source_${suffix}`;
const targetName = `backup_target_${suffix}`;
const sourceUrl = databaseUrlFor(sourceName);
const targetUrl = databaseUrlFor(targetName);
let temporaryRoot: string;

describe("backup and restore", () => {
  beforeAll(async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), "mycharacter-backup-"));
    await createDatabaseNamed(sourceName);
    await createDatabaseNamed(targetName);
  });

  afterAll(async () => {
    await dropDatabaseNamed(sourceName);
    await dropDatabaseNamed(targetName);
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("restores database records and the exact PDF bytes", async () => {
    const sourceStorage = path.join(temporaryRoot, "source-storage");
    const targetStorage = path.join(temporaryRoot, "target-storage");
    const backupRoot = path.join(temporaryRoot, "backups");
    await Promise.all([
      writeFile(path.join(temporaryRoot, ".keep"), ""),
      ensureDirectory(sourceStorage),
      ensureDirectory(targetStorage),
      ensureDirectory(backupRoot),
    ]);

    const fixture = await seedFixture(sourceStorage);
    await runScript("backup.sh", {
      DATABASE_URL: sourceUrl,
      STORAGE_ROOT: sourceStorage,
      BACKUP_ROOT: backupRoot,
    });
    const [backupDirectory] = await readdir(backupRoot);
    expect(backupDirectory).toBeTruthy();
    await runScript("restore.sh", {
      DATABASE_URL: targetUrl,
      STORAGE_ROOT: targetStorage,
      BACKUP_PATH: path.join(backupRoot, backupDirectory),
    });

    const restored = createDatabase(targetUrl);
    try {
      const value = await restored
        .selectFrom("character_values")
        .select(["value", "version"])
        .executeTakeFirstOrThrow();
      const thread = await restored
        .selectFrom("ai_threads")
        .select("title")
        .executeTakeFirstOrThrow();
      expect(value).toEqual({ value: "Restored hero", version: 7 });
      expect(thread.title).toBe("Backup fixture");
    } finally {
      await restored.destroy();
    }

    const restoredPdf = await readFile(path.join(targetStorage, fixture.storageKey));
    expect(createHash("sha256").update(restoredPdf).digest("hex")).toBe(fixture.sha256);
    expect(restoredPdf).toEqual(fixture.bytes);
  }, 60_000);
});

async function seedFixture(storageRoot: string) {
  const db = createDatabase(sourceUrl);
  await runMigrations(db);
  const userId = randomUUID();
  const fileId = randomUUID();
  const templateId = randomUUID();
  const fieldId = randomUUID();
  const characterId = randomUUID();
  const threadId = randomUUID();
  const storageKey = `templates/${templateId.slice(0, 2)}/${userId}/${templateId}.pdf`;
  const bytes = Buffer.from("%PDF-1.7\nbackup integration fixture\n%%EOF\n");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await ensureDirectory(path.dirname(path.join(storageRoot, storageKey)));
  await writeFile(path.join(storageRoot, storageKey), bytes);

  try {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("users")
        .values({
          id: userId,
          email: `backup-${suffix}@example.test`,
          password_hash: "fixture-hash",
        })
        .execute();
      await trx
        .insertInto("profiles")
        .values({ id: userId, username: `user-${userId.replaceAll("-", "").slice(0, 8)}` })
        .execute();
      await trx
        .insertInto("object_files")
        .values({
          id: fileId,
          storage_key: storageKey,
          sha256,
          size_bytes: String(bytes.byteLength),
          media_type: "application/pdf",
          state: "ready",
        })
        .execute();
      await trx
        .insertInto("pdf_templates")
        .values({
          id: templateId,
          file_id: fileId,
          owner_id: userId,
          title: "Backup template",
          slug: "backup-template",
          game_system: "Test",
          storage_path: storageKey,
          sha256,
          page_count: 1,
        })
        .execute();
      await trx
        .insertInto("pdf_fields")
        .values({
          id: fieldId,
          template_id: templateId,
          pdf_name: "hero_name",
          kind: "text",
          options: JSON.stringify([]),
          page: 1,
        })
        .execute();
      await trx
        .insertInto("characters")
        .values({
          id: characterId,
          template_id: templateId,
          owner_id: userId,
          name: "Backup hero",
        })
        .execute();
      await trx
        .insertInto("character_values")
        .values({
          character_id: characterId,
          field_id: fieldId,
          value: JSON.stringify("Restored hero"),
          version: 7,
          updated_by: userId,
        })
        .execute();
      await trx
        .insertInto("ai_threads")
        .values({
          id: threadId,
          character_id: characterId,
          user_id: userId,
          copilot_thread_id: `backup-${suffix}`,
          title: "Backup fixture",
        })
        .execute();
      await trx
        .insertInto("ai_messages")
        .values({
          thread_id: threadId,
          message_id: "fixture-message",
          role: "user",
          content: JSON.stringify({ text: "keep me" }),
          sequence_index: 0,
        })
        .execute();
    });
  } finally {
    await db.destroy();
  }
  return { bytes, sha256, storageKey };
}

function databaseUrlFor(databaseName: string): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createDatabaseNamed(databaseName: string): Promise<void> {
  const client = new Client({ connectionString: adminDatabaseUrl });
  await client.connect();
  try {
    await client.query(`create database "${databaseName}"`);
  } finally {
    await client.end();
  }
}

async function dropDatabaseNamed(databaseName: string): Promise<void> {
  const client = new Client({ connectionString: adminDatabaseUrl });
  await client.connect();
  try {
    await client.query(`drop database if exists "${databaseName}" with (force)`);
  } finally {
    await client.end();
  }
}

async function runScript(script: string, environment: Record<string, string>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("sh", [path.join(repositoryRoot, "scripts", script)], {
      cwd: repositoryRoot,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed (${code}): ${stderr}`));
    });
  });
}

async function ensureDirectory(directory: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(directory, { recursive: true });
}
