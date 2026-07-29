import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg");

const databaseUrl = requiredEnv("DATABASE_URL");
const configuredRoot = path.resolve(requiredEnv("STORAGE_ROOT"));
const manifestFlag = process.argv.indexOf("--manifest");
const manifestPath =
  manifestFlag === -1 ? null : path.resolve(process.argv[manifestFlag + 1] ?? "");
if (manifestFlag !== -1 && !process.argv[manifestFlag + 1]) {
  throw new Error("--manifest requires a file path");
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const root = await realpath(configuredRoot);
  const result = await client.query(
    `select storage_key, sha256, size_bytes::text
       from object_files
      where state = 'ready'
      order by storage_key`,
  );
  const referenced = new Map(result.rows.map((row) => [row.storage_key, row]));
  const diskFiles = await listFiles(root);
  const diskKeys = new Set(diskFiles);
  const errors = [];
  const manifest = [];

  for (const row of referenced.values()) {
    const target = safeStoragePath(root, row.storage_key);
    if (!diskKeys.has(row.storage_key)) {
      errors.push(`missing live object: ${row.storage_key}`);
      continue;
    }
    const metadata = await lstat(target);
    const actualSize = String(metadata.size);
    const actualSha = await sha256File(target);
    manifest.push({
      storageKey: row.storage_key,
      sizeBytes: actualSize,
      sha256: actualSha,
    });
    if (actualSize !== row.size_bytes) {
      errors.push(
        `size mismatch: ${row.storage_key} (database ${row.size_bytes}, disk ${actualSize})`,
      );
    }
    if (actualSha !== row.sha256) {
      errors.push(
        `SHA-256 mismatch: ${row.storage_key} (database ${row.sha256}, disk ${actualSha})`,
      );
    }
  }

  for (const storageKey of diskFiles) {
    if (!referenced.has(storageKey)) {
      errors.push(`unreferenced file: ${storageKey}`);
    }
  }

  manifest.sort((left, right) => left.storageKey.localeCompare(right.storageKey));
  if (manifestPath) {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    console.error(`Storage verification failed with ${errors.length} problem(s).`);
    process.exitCode = 1;
  } else {
    console.log(`Storage verification passed: ${manifest.length} live object(s).`);
  }
} finally {
  await client.end();
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function listFiles(root) {
  const result = [];
  await walk(root, root, result);
  return result.sort();
}

async function walk(root, directory, result) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      result.push(path.relative(root, absolute));
    } else if (entry.isDirectory()) {
      await walk(root, absolute, result);
    } else if (entry.isFile()) {
      result.push(path.relative(root, absolute));
    }
  }
}

function safeStoragePath(root, storageKey) {
  const target = path.resolve(root, storageKey);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe storage key in database: ${storageKey}`);
  }
  return target;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
