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
import type { Kysely } from "kysely";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const password = "correct horse battery staple";

describe("character PDF export", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let storageRoot: string;
  let storage: FilesystemStorage;
  let owner: { userId: string; cookie: string };
  let stranger: { userId: string; cookie: string };
  let characterId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), "mycharacter-export-"));
    storage = new FilesystemStorage(storageRoot);
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storage,
    });
    owner = await register("owner.export@example.com");
    stranger = await register("stranger.export@example.com");
  });

  beforeEach(async () => {
    await testDb.db.deleteFrom("character_mutations").execute();
    await testDb.db.deleteFrom("character_values").execute();
    await testDb.db.deleteFrom("characters").execute();
    await testDb.db.deleteFrom("pdf_fields").execute();
    await testDb.db.deleteFrom("pdf_templates").execute();
    await testDb.db.deleteFrom("object_files").execute();
    await rm(storageRoot, { recursive: true, force: true });

    const templateId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    const storageKey = `templates/ab/${templateId}/${fileId}.pdf`;
    await storage.put(storageKey, await sourcePdf());
    await testDb.db
      .insertInto("object_files")
      .values({
        id: fileId,
        storage_key: storageKey,
        sha256: "a".repeat(64),
        size_bytes: String((await storage.stat(storageKey)).size),
        media_type: "application/pdf",
        state: "ready",
      })
      .execute();
    await testDb.db
      .insertInto("pdf_templates")
      .values({
        id: templateId,
        file_id: fileId,
        owner_id: owner.userId,
        visibility: "private",
        title: "Export",
        slug: "export",
        storage_path: storageKey,
        sha256: "a".repeat(64),
        page_count: 1,
        catalog_status: "ready",
        catalog_approved_at: new Date(),
      })
      .execute();
    const nameField = await testDb.db
      .insertInto("pdf_fields")
      .values({
        template_id: templateId,
        pdf_name: "name",
        kind: "text",
        page: 1,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    characterId = (
      await testDb.db
        .insertInto("characters")
        .values({
          template_id: templateId,
          owner_id: owner.userId,
          name: "Герой",
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    await testDb.db
      .insertInto("character_values")
      .values({
        character_id: characterId,
        field_id: nameField.id,
        value: JSON.stringify("Ада"),
        version: 1,
        updated_by: owner.userId,
      })
      .execute();
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
    await rm(storageRoot, { recursive: true, force: true });
  });

  it.each([
    ["interactive", false],
    ["flattened", true],
  ] as const)("streams a server-generated %s PDF", async (mode, flattened) => {
    const response = await app.inject({
      method: "POST",
      url: `/api/characters/${characterId}/export?mode=${mode}`,
      cookies: { mycharacter_session: owner.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain(
      encodeURIComponent(flattened ? "Герой-print.pdf" : "Герой.pdf"),
    );
    const exported = await PDFDocument.load(response.rawPayload);
    if (flattened) {
      expect(exported.getForm().getFields()).toHaveLength(0);
    } else {
      expect(exported.getForm().getTextField("name").getText()).toBe("Ада");
    }
  });

  it("hides exports from strangers", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/characters/${characterId}/export?mode=interactive`,
      cookies: { mycharacter_session: stranger.cookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it("rejects an invalid export mode", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/characters/${characterId}/export?mode=unknown`,
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_FAILED");
  });

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

async function sourcePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([400, 400]);
  const field = document.getForm().createTextField("name");
  field.addToPage(page, { x: 20, y: 20, width: 200, height: 24 });
  return document.save();
}
