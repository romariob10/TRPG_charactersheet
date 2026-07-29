import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import { FilesystemStorage } from "@mycharacter/storage";
import { StorageError, type ObjectStorage } from "@mycharacter/storage";
import type { Kysely } from "kysely";
import { PDFDocument, PDFName } from "pdf-lib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const password = "correct horse battery staple";

describe("private PDF routes", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let storageRoot: string;
  let owner: { userId: string; cookie: string };
  let stranger: { userId: string; cookie: string };

  beforeAll(async () => {
    testDb = await createTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), "mycharacter-pdf-routes-"));
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storageRoot,
    });
    owner = await register("owner.pdf@example.com");
    stranger = await register("stranger.pdf@example.com");
  });

  beforeEach(async () => {
    await testDb.db.deleteFrom("character_values").execute();
    await testDb.db.deleteFrom("characters").execute();
    await testDb.db.deleteFrom("catalog_jobs").execute();
    await testDb.db.deleteFrom("pdf_fields").execute();
    await testDb.db.deleteFrom("pdf_templates").execute();
    await testDb.db.deleteFrom("object_files").execute();
    await rm(storageRoot, { recursive: true, force: true });
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("uploads a validated PDF and serves an authorized byte range", async () => {
    const bytes = await editablePdf();
    const uploaded = await upload(bytes, owner.cookie);
    expect(uploaded.statusCode).toBe(201);
    const templateId = uploaded.json().templateId as string;

    const response = await app.inject({
      method: "GET",
      url: `/api/templates/${templateId}/pdf`,
      cookies: { mycharacter_session: owner.cookie },
      headers: { range: "bytes=0-4" },
    });
    expect(response.statusCode).toBe(206);
    expect(response.headers["content-range"]).toMatch(/^bytes 0-4\//);
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.rawPayload.toString()).toBe("%PDF-");

    const file = await testDb.db
      .selectFrom("object_files")
      .select(["state", "storage_key"])
      .executeTakeFirstOrThrow();
    expect(file.state).toBe("ready");
    expect(file.storage_key).toMatch(/^templates\/[0-9a-f]{2}\//);
  });

  it("serves the same private PDF through an authorized character", async () => {
    const uploaded = await upload(await editablePdf(), owner.cookie);
    const templateId = uploaded.json().templateId as string;
    await testDb.db
      .updateTable("pdf_templates")
      .set({ catalog_status: "ready", catalog_approved_at: new Date() })
      .where("id", "=", templateId)
      .execute();
    const created = await app.inject({
      method: "POST",
      url: "/api/characters",
      cookies: { mycharacter_session: owner.cookie },
      payload: { name: "Arven", templateId },
    });
    const response = await app.inject({
      method: "GET",
      url: `/api/characters/${created.json().id}/pdf`,
      cookies: { mycharacter_session: owner.cookie },
      headers: { range: "bytes=-5" },
    });
    expect(response.statusCode).toBe(206);
    expect(response.rawPayload).toHaveLength(5);
  });

  it("hides private template and character PDFs from strangers", async () => {
    const uploaded = await upload(await editablePdf(), owner.cookie);
    const templateId = uploaded.json().templateId as string;
    const response = await app.inject({
      method: "GET",
      url: `/api/templates/${templateId}/pdf`,
      cookies: { mycharacter_session: stranger.cookie },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("PDF_NOT_FOUND");
  });

  it("returns 416 for an unsatisfiable range", async () => {
    const uploaded = await upload(await editablePdf(), owner.cookie);
    const templateId = uploaded.json().templateId as string;
    const response = await app.inject({
      method: "GET",
      url: `/api/templates/${templateId}/pdf`,
      cookies: { mycharacter_session: owner.cookie },
      headers: { range: "bytes=999999-1000000" },
    });
    expect(response.statusCode).toBe(416);
    expect(response.headers["content-range"]).toMatch(/^bytes \*\//);
  });

  it.each([
    ["invalid magic bytes", Buffer.from("not a pdf"), "PDF_INVALID_MAGIC", 422],
    ["encrypted PDF", null, "PDF_ENCRYPTED", 422],
    ["missing AcroForm", null, "PDF_ACROFORM_REQUIRED", 422],
    ["XFA-only PDF", null, "PDF_XFA_UNSUPPORTED", 422],
  ] as const)("%s returns %s without partial files", async (fixture, fixed, code, status) => {
    const bytes =
      fixed ??
      (fixture === "missing AcroForm"
        ? await plainPdf()
        : fixture === "encrypted PDF"
          ? await encryptedPdf()
          : await xfaOnlyPdf());
    const response = await upload(bytes, owner.cookie);
    expect(response.statusCode).toBe(status);
    expect(response.json().error.code).toBe(code);
    expect(await new FilesystemStorage(storageRoot).listPartialFiles()).toEqual([]);
    expect(await testDb.db.selectFrom("object_files").select("id").execute()).toEqual([]);
  });

  it("rejects an oversized multipart file without leaving metadata", async () => {
    const response = await upload(Buffer.alloc(25 * 1024 * 1024 + 1, 0x41), owner.cookie);
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("PDF_TOO_LARGE");
    expect(await testDb.db.selectFrom("object_files").select("id").execute()).toEqual([]);
  });

  it.each([
    ["STORAGE_FULL", 507],
    ["STORAGE_WRITE_FAILED", 503],
  ] as const)("maps %s and cleans pending metadata", async (storageCode, status) => {
    const failingStorage: ObjectStorage = {
      put: async () => {
        throw new StorageError(storageCode, "injected storage failure");
      },
      stat: async () => {
        throw new Error("not used");
      },
      open: async () => {
        throw new Error("not used");
      },
      delete: async () => undefined,
    };
    const failingApp = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storage: failingStorage,
    });
    try {
      const bytes = await editablePdf();
      const form = new FormData();
      form.set("title", "Failure");
      form.set("gameSystem", "Test RPG");
      form.set("file", new File([Buffer.from(bytes)], "sheet.pdf"));
      const encoded = new Response(form);
      const response = await failingApp.inject({
        method: "POST",
        url: "/api/templates",
        cookies: { mycharacter_session: owner.cookie },
        headers: { "content-type": encoded.headers.get("content-type")! },
        payload: Buffer.from(await encoded.arrayBuffer()),
      });
      expect(response.statusCode).toBe(status);
      expect(response.json().error.code).toBe(storageCode);
      expect(await testDb.db.selectFrom("object_files").select("id").execute()).toEqual([]);
    } finally {
      await failingApp.close();
    }
  });

  async function upload(bytes: Uint8Array, cookie: string) {
    const form = new FormData();
    form.set("title", "My system");
    form.set("gameSystem", "Test RPG");
    form.set("file", new File([Buffer.from(bytes)], "sheet.pdf", { type: "application/pdf" }));
    const encoded = new Response(form);
    return app.inject({
      method: "POST",
      url: "/api/templates",
      cookies: { mycharacter_session: cookie },
      headers: { "content-type": encoded.headers.get("content-type")! },
      payload: Buffer.from(await encoded.arrayBuffer()),
    });
  }

  async function register(email: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password },
    });
    return {
      userId: response.json().user.id as string,
      cookie: response.cookies.find((item) => item.name === "mycharacter_session")!.value,
    };
  }
});

async function editablePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([400, 400]);
  const field = document.getForm().createTextField("name");
  field.addToPage(page, { x: 20, y: 20, width: 200, height: 24 });
  return document.save();
}

async function plainPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([400, 400]);
  return document.save();
}

async function xfaOnlyPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([400, 400]);
  const acroForm = document.context.obj({
    XFA: document.context.obj(["template", "<xdp />"]),
  });
  document.catalog.set(PDFName.of("AcroForm"), acroForm);
  return document.save();
}

async function encryptedPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([400, 400]);
  const source = Buffer.from(
    await document.save({ useObjectStreams: false }),
  ).toString("latin1");
  const encrypted = source.replace(/\/Info\s+(\d+\s+\d+\s+R)/, "/Encrypt $1");
  if (encrypted === source) throw new Error("Could not create encrypted PDF fixture.");
  return Buffer.from(encrypted, "latin1");
}
