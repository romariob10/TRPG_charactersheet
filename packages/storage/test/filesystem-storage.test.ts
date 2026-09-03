import { mkdir, mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilesystemStorage, StorageError } from "../src/index.js";

const roots: string[] = [];
const validKey =
  "templates/aa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf";
const characterImageKey =
  "character-images/aa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png";

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createStorage() {
  const root = await mkdtemp(join(tmpdir(), "mycharacter-storage-"));
  roots.push(root);
  return { root, storage: new FilesystemStorage(root) };
}

describe("FilesystemStorage", () => {
  it("rejects traversal keys", async () => {
    const { storage } = await createStorage();
    await expect(storage.open("../../etc/passwd")).rejects.toMatchObject({
      code: "INVALID_STORAGE_KEY",
    });
  });

  it("writes atomically and opens the stored object", async () => {
    const { root, storage } = await createStorage();
    await storage.put(validKey, Buffer.from("%PDF-test"));

    const opened = await storage.open(validKey);
    expect(opened.size).toBe(9);
    expect(await readFile(opened.path, "utf8")).toBe("%PDF-test");
    expect(await storage.stat(validKey)).toMatchObject({ size: 9 });
    expect(await storage.listPartialFiles()).toEqual([]);
    expect(root).not.toBe("");
  });

  it("stores private character portraits", async () => {
    const { storage } = await createStorage();
    await storage.put(characterImageKey, Buffer.from([137, 80, 78, 71]));

    const opened = await storage.open(characterImageKey);
    expect(opened.size).toBe(4);
  });

  it("rejects a symlink escape", async () => {
    const { root, storage } = await createStorage();
    const outside = await mkdtemp(join(tmpdir(), "mycharacter-outside-"));
    roots.push(outside);
    await mkdir(join(root, "templates"), { recursive: true });
    await symlink(outside, join(root, "templates", "aa"));

    await expect(storage.put(validKey, Buffer.from("%PDF-test"))).rejects.toBeInstanceOf(
      StorageError,
    );
    await expect(storage.put(validKey, Buffer.from("%PDF-test"))).rejects.toMatchObject({
      code: "INVALID_STORAGE_KEY",
    });
  });

  it("deletes a stored object idempotently", async () => {
    const { storage } = await createStorage();
    await storage.put(validKey, Buffer.from("%PDF-test"));
    await storage.delete(validKey);
    await storage.delete(validKey);
    await expect(storage.open(validKey)).rejects.toMatchObject({
      code: "STORAGE_NOT_FOUND",
    });
  });

  it("cleans partial files when the atomic rename fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "mycharacter-storage-"));
    roots.push(root);
    const storage = new FilesystemStorage(root, {
      rename: async () => {
        const error = new Error("rename failed") as NodeJS.ErrnoException;
        error.code = "EIO";
        throw error;
      },
    });

    await expect(storage.put(validKey, Buffer.from("%PDF-test"))).rejects.toMatchObject({
      code: "STORAGE_WRITE_FAILED",
    });
    expect(await storage.listPartialFiles()).toEqual([]);
  });
});
