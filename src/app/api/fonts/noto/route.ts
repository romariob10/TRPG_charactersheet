import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const fontPath = path.join(
    process.cwd(),
    "node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff",
  );
  const bytes = await readFile(fontPath);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "font/woff",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
