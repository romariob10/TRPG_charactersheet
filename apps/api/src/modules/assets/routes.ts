import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";

const immutableCache = "public, max-age=31536000, immutable";

export async function registerAssetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/pdf-worker", async (_request, reply) => {
    const bytes = await readDependencyFile("pdfjs-dist/build/pdf.worker.min.mjs");
    return reply
      .header("content-type", "text/javascript; charset=utf-8")
      .header("cache-control", immutableCache)
      .send(bytes);
  });

  app.get("/api/fonts/noto", async (_request, reply) => {
    const bytes = await readDependencyFile(
      "@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff",
    );
    return reply
      .header("content-type", "font/woff")
      .header("cache-control", immutableCache)
      .send(bytes);
  });
}

async function readDependencyFile(relativePath: string): Promise<Buffer> {
  const candidates = [
    path.join(process.cwd(), "apps/api/node_modules", relativePath),
    path.join(process.cwd(), "node_modules", relativePath),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  throw new Error(`Bundled asset is missing: ${relativePath}`);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
