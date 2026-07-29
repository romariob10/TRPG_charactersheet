import { constants, createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  open as openFile,
  readdir,
  realpath,
  rename,
  stat as fileStat,
  unlink,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ObjectRange,
  ObjectStat,
  ObjectStorage,
  OpenedObject,
} from "./object-storage.js";
import { assertStorageKey, StorageError } from "./storage-key.js";

export class FilesystemStorage implements ObjectStorage {
  private readonly configuredRoot: string;
  private readonly renameObject: typeof rename;

  public constructor(root: string, options: { rename?: typeof rename } = {}) {
    if (!isAbsolute(root)) {
      throw new StorageError("INVALID_STORAGE_KEY", "Storage root must be absolute.");
    }
    this.configuredRoot = resolve(root);
    this.renameObject = options.rename ?? rename;
  }

  async put(key: string, bytes: Uint8Array): Promise<ObjectStat> {
    assertStorageKey(key);
    const { parent, target } = await this.resolveWritableTarget(key);
    const partial = join(parent, `.${target.slice(parent.length + 1)}.partial-${randomUUID()}`);
    let handle: Awaited<ReturnType<typeof openFile>> | undefined;
    let renamed = false;
    try {
      handle = await openFile(
        partial,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600,
      );
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await this.renameObject(partial, target);
      renamed = true;
      const directory = await openFile(parent, constants.O_RDONLY);
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
      return this.stat(key);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await unlink(partial).catch(() => undefined);
      if (renamed) await unlink(target).catch(() => undefined);
      throw mapStorageError(error, "STORAGE_WRITE_FAILED");
    }
  }

  async stat(key: string): Promise<ObjectStat> {
    const target = await this.resolveReadableTarget(key);
    try {
      const metadata = await fileStat(target);
      if (!metadata.isFile()) {
        throw new StorageError("STORAGE_NOT_FOUND", "Stored object was not found.");
      }
      return { size: metadata.size, modifiedAt: metadata.mtime };
    } catch (error) {
      throw mapStorageError(error, "STORAGE_NOT_FOUND");
    }
  }

  async open(key: string, range: ObjectRange = {}): Promise<OpenedObject> {
    const path = await this.resolveReadableTarget(key);
    let metadata;
    try {
      metadata = await fileStat(path);
      if (!metadata.isFile()) {
        throw new StorageError("STORAGE_NOT_FOUND", "Stored object was not found.");
      }
    } catch (error) {
      throw mapStorageError(error, "STORAGE_NOT_FOUND");
    }
    return {
      path,
      size: metadata.size,
      modifiedAt: metadata.mtime,
      stream: createReadStream(path, {
        ...(range.start === undefined ? {} : { start: range.start }),
        ...(range.end === undefined ? {} : { end: range.end }),
      }),
    };
  }

  async delete(key: string): Promise<void> {
    assertStorageKey(key);
    let target: string;
    try {
      target = await this.resolveReadableTarget(key);
    } catch (error) {
      if (error instanceof StorageError && error.code === "STORAGE_NOT_FOUND") return;
      throw error;
    }
    try {
      await unlink(target);
    } catch (error) {
      if (nodeCode(error) !== "ENOENT") throw mapStorageError(error, "STORAGE_WRITE_FAILED");
    }
  }

  async listPartialFiles(): Promise<string[]> {
    await mkdir(this.configuredRoot, { recursive: true, mode: 0o700 });
    const root = await realpath(this.configuredRoot);
    const result: string[] = [];
    await walk(root, result);
    return result;
  }

  private async resolveWritableTarget(
    key: string,
  ): Promise<{ parent: string; target: string }> {
    const root = await this.prepareRoot();
    const segments = key.split("/");
    let current = root;
    for (const segment of segments.slice(0, -1)) {
      current = join(current, segment);
      try {
        const metadata = await lstat(current);
        if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
          throw invalidKey();
        }
      } catch (error) {
        if (nodeCode(error) !== "ENOENT") throw error;
        await mkdir(current, { mode: 0o700 });
      }
      current = await realpath(current);
      assertInside(root, current);
    }
    const target = join(current, segments.at(-1)!);
    assertInside(root, target);
    return { parent: current, target };
  }

  private async resolveReadableTarget(key: string): Promise<string> {
    assertStorageKey(key);
    const root = await this.prepareRoot();
    const candidate = resolve(root, ...key.split("/"));
    assertInside(root, candidate);
    try {
      const metadata = await lstat(candidate);
      if (metadata.isSymbolicLink()) throw invalidKey();
      const canonical = await realpath(candidate);
      assertInside(root, canonical);
      return canonical;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw mapStorageError(error, "STORAGE_NOT_FOUND");
    }
  }

  private async prepareRoot(): Promise<string> {
    await mkdir(this.configuredRoot, { recursive: true, mode: 0o700 });
    return realpath(this.configuredRoot);
  }
}

function assertInside(root: string, candidate: string): void {
  const child = relative(root, candidate);
  if (child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child))) {
    return;
  }
  throw invalidKey();
}

function invalidKey(): StorageError {
  return new StorageError("INVALID_STORAGE_KEY", "Storage path escapes its root.");
}

function nodeCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function mapStorageError(
  error: unknown,
  fallback: "STORAGE_NOT_FOUND" | "STORAGE_WRITE_FAILED",
): StorageError {
  if (error instanceof StorageError) return error;
  const code = nodeCode(error);
  if (code === "ENOSPC" || code === "EDQUOT") {
    return new StorageError("STORAGE_FULL", "PDF storage is full.", error);
  }
  if (code === "ENOENT" && fallback === "STORAGE_NOT_FOUND") {
    return new StorageError("STORAGE_NOT_FOUND", "Stored object was not found.", error);
  }
  return new StorageError(fallback, "Filesystem storage operation failed.", error);
}

async function walk(directory: string, result: string[]): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await walk(path, result);
    } else if (entry.isFile() && entry.name.includes(".partial-")) {
      result.push(path);
    }
  }
}
