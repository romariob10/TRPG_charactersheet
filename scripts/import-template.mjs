import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { createDatabase } from "../packages/database/dist/index.js";
import { FilesystemStorage } from "../packages/storage/dist/index.js";
import { createJobClient } from "../apps/api/dist/jobs/client.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { PDFDocument, PDFDict, PDFName } = require("pdf-lib");

const [fileArgument, title, gameSystem = null] = process.argv.slice(2);
if (!fileArgument || !title) {
  console.error("Usage: node scripts/import-template.mjs <file.pdf> <title> [game-system]");
  process.exit(64);
}
if (title.length > 160 || (gameSystem && gameSystem.length > 160)) {
  throw new Error("Template title and game system must be at most 160 characters");
}

const databaseUrl = requiredEnv("DATABASE_URL");
const storageRoot = requiredEnv("STORAGE_ROOT");
const bytes = await readFile(path.resolve(fileArgument));
if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("Template is larger than 25 MB");
if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
  throw new Error("Template is not a PDF file");
}

const pdf = await PDFDocument.load(bytes, {
  ignoreEncryption: false,
  updateMetadata: false,
});
const pageCount = pdf.getPageCount();
const acroFormReference = pdf.catalog.get(PDFName.of("AcroForm"));
const acroForm = acroFormReference
  ? pdf.context.lookup(acroFormReference, PDFDict)
  : undefined;
if (acroForm?.has(PDFName.of("XFA")) && pdf.getForm().getFields().length === 0) {
  throw new Error("XFA-only PDFs are not supported");
}
if (pageCount < 1 || pageCount > 20 || pdf.getForm().getFields().length === 0) {
  throw new Error("Template must be an AcroForm PDF with at most 20 pages");
}

const db = createDatabase(databaseUrl);
const storage = new FilesystemStorage(storageRoot);
const jobs = await createJobClient(databaseUrl);
const templateId = randomUUID();
const fileId = randomUUID();
const slug =
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "") || "template";
const systemOwner = "00000000-0000-0000-0000-000000000000";
const storageKey = `templates/${templateId.slice(0, 2)}/${systemOwner}/${templateId}.pdf`;
const sha256 = createHash("sha256").update(bytes).digest("hex");

try {
  await db
    .insertInto("object_files")
    .values({
      id: fileId,
      storage_key: storageKey,
      sha256,
      size_bytes: String(bytes.byteLength),
      media_type: "application/pdf",
      state: "pending",
    })
    .execute();
  await storage.put(storageKey, bytes);
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("pdf_templates")
      .values({
        id: templateId,
        file_id: fileId,
        owner_id: null,
        visibility: "curated",
        title,
        slug,
        game_system: gameSystem,
        storage_path: storageKey,
        sha256,
        page_count: pageCount,
        catalog_status: "pending",
        allow_vision: true,
        is_public: true,
      })
      .execute();
    const catalogJob = await trx
      .insertInto("catalog_jobs")
      .values({ template_id: templateId, current_step: "queued", progress: 0 })
      .returning("id")
      .executeTakeFirstOrThrow();
    await jobs.enqueueCatalog(trx, {
      templateId,
      catalogJobId: catalogJob.id,
    });
    await trx
      .updateTable("object_files")
      .set({ state: "ready" })
      .where("id", "=", fileId)
      .execute();
  });
  console.log(`Curated template imported: ${templateId}`);
} catch (error) {
  await storage.delete(storageKey).catch(() => undefined);
  await db.deleteFrom("object_files").where("id", "=", fileId).execute();
  throw error;
} finally {
  await jobs.stop();
  await db.destroy();
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
