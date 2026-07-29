import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const scannedPaths = [
  "apps",
  "packages",
  "scripts",
  "compose.yaml",
  "compose.prod.yaml",
  "Dockerfile",
  "Dockerfile.web",
  "Dockerfile.backend",
  "Caddyfile",
  "Caddyfile.prod",
  "package.json",
  ".env.example",
  ".env.prod.example",
];
const forbidden = [
  /@supabase\//i,
  /\bsupabase(?:_|\b)/i,
  /\binngest(?:_|\b)/i,
];

describe("local backend cutover", () => {
  it("contains no Supabase or Inngest runtime references", async () => {
    const violations: string[] = [];

    for (const relativePath of scannedPaths) {
      const absolutePath = path.join(repositoryRoot, relativePath);
      for (const filePath of await collectFiles(absolutePath)) {
        if (
          filePath.includes(`${path.sep}dist${path.sep}`) ||
          filePath.includes(`${path.sep}node_modules${path.sep}`) ||
          filePath.endsWith(".tsbuildinfo") ||
          filePath.endsWith("no-supabase.test.ts")
        ) {
          continue;
        }
        const source = await readFile(filePath, "utf8");
        source.split("\n").forEach((line, index) => {
          if (forbidden.some((pattern) => pattern.test(line))) {
            violations.push(
              `${path.relative(repositoryRoot, filePath)}:${index + 1}: ${line.trim()}`,
            );
          }
        });
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

async function collectFiles(target: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch (error) {
    if (isNotDirectory(error)) {
      return [target];
    }
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }

  const files = await Promise.all(
    entries.map((entry) => {
      const child = path.join(target, entry.name);
      return entry.isDirectory() ? collectFiles(child) : Promise.resolve([child]);
    }),
  );
  return files.flat();
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isNotDirectory(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOTDIR";
}
