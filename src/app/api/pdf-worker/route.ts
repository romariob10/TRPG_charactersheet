import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const bytes = await readFile(path.join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"));
  return new NextResponse(bytes, {
    headers: { "Content-Type": "text/javascript", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
