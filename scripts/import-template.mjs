import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Inngest } from "inngest";
import { PDFDocument } from "pdf-lib";

const [fileArgument, title, gameSystem = null] = process.argv.slice(2);
if (!fileArgument || !title) {
  console.error("Usage: pnpm template:import <file.pdf> <title> [game-system]");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Supabase environment variables are required");
const filePath = path.resolve(fileArgument);
const bytes = await readFile(filePath);
const pdf = await PDFDocument.load(bytes);
const pageCount = pdf.getPageCount();
if (pageCount > 20 || pdf.getForm().getFields().length === 0) throw new Error("Template must be an AcroForm PDF with at most 20 pages");
const templateId = randomUUID();
const storagePath = `curated/${templateId}/source.pdf`;
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const { error: uploadError } = await supabase.storage.from("character-pdfs").upload(storagePath, bytes, { contentType: "application/pdf" });
if (uploadError) throw uploadError;
const { error } = await supabase.from("pdf_templates").insert({ id: templateId, owner_id: null, visibility: "curated", title, game_system: gameSystem, storage_path: storagePath, sha256: createHash("sha256").update(bytes).digest("hex"), page_count: pageCount, catalog_status: "pending", allow_vision: true });
if (error) throw error;
const { data: job } = await supabase.from("catalog_jobs").insert({ template_id: templateId }).select("id").single();
const inngest = new Inngest({ id: "mycharacter-import", eventKey: process.env.INNGEST_EVENT_KEY });
await inngest.send({ name: "catalog/requested", data: { templateId, characterId: "00000000-0000-0000-0000-000000000000", userId: "system", jobId: job?.id } });
console.log(`Imported curated template ${templateId}`);
