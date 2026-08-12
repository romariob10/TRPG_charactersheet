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

describe("deleted template restore on duplicate upload", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let storageRoot: string;
  let owner: { userId: string; cookie: string };
  let stranger: { userId: string; cookie: string };

  beforeAll(async () => {
    testDb = await createTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), "mycharacter-pdf-restore-"));
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storageRoot,
    });
    owner = await register("owner.restore@example.com");
    stranger = await register("stranger.restore@example.com");
  });

  beforeEach(async () => {
    await testDb.db.deleteFrom("character_values").execute();
    await testDb.db.deleteFrom("characters").execute();
    await testDb.db.deleteFrom("catalog_jobs").execute();
    await testDb.db.deleteFrom("pdf_fields").execute();
    await testDb.db.deleteFrom("template_subscriptions").execute();
    await testDb.db.deleteFrom("pdf_templates").execute();
    await testDb.db.deleteFrom("object_files").execute();
    await rm(storageRoot, { recursive: true, force: true });
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("restores the deleted template when the same bytes are uploaded again", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie);
    expect(created.statusCode).toBe(201);
    const templateId = created.json().templateId as string;
    await seedField(templateId);
    await approveTemplate(templateId);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/templates/${templateId}`,
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(deleted.statusCode).toBe(204);

    const second = await upload(bytes, owner.cookie);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      templateId,
      existing: false,
      restored: true,
    });

    const rows = await testDb.db
      .selectFrom("pdf_templates")
      .select(["id", "deleted_at"])
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(templateId);
    expect(rows[0].deleted_at).toBeNull();

    const fields = await testDb.db
      .selectFrom("pdf_fields")
      .select("id")
      .where("template_id", "=", templateId)
      .execute();
    expect(fields).toHaveLength(1);
  });

  it("restores by content when the file name differs", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie, { fileName: "first.pdf" });
    const templateId = created.json().templateId as string;
    await trashTemplate(templateId);

    const second = await upload(bytes, owner.cookie, {
      fileName: "renamed-copy.pdf",
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ templateId, restored: true });
  });

  it("updates metadata from the fresh form and keeps publicity from the form", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie, {
      title: "Old title",
      gameSystem: "Old system",
      publishCommunity: true,
    });
    const templateId = created.json().templateId as string;
    await trashTemplate(templateId);

    const second = await upload(bytes, owner.cookie, {
      title: "New title",
      gameSystem: "New system",
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ templateId, restored: true });

    const template = await testDb.db
      .selectFrom("pdf_templates")
      .select(["title", "game_system", "is_public"])
      .where("id", "=", templateId)
      .executeTakeFirstOrThrow();
    expect(template.title).toBe("New title");
    expect(template.game_system).toBe("New system");
    expect(template.is_public).toBe(false);
  });

  it("keeps existing characters working after restore", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie);
    const templateId = created.json().templateId as string;
    await seedField(templateId);
    await approveTemplate(templateId);
    const character = await app.inject({
      method: "POST",
      url: "/api/characters",
      cookies: { mycharacter_session: owner.cookie },
      payload: { name: "Arven", templateId },
    });
    expect(character.statusCode).toBe(201);
    const characterId = character.json().id as string;

    await trashTemplate(templateId);
    const second = await upload(bytes, owner.cookie);
    expect(second.json()).toMatchObject({ templateId, restored: true });

    const characterCheck = await app.inject({
      method: "GET",
      url: `/api/characters/${characterId}`,
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(characterCheck.statusCode).toBe(200);
    const pdf = await app.inject({
      method: "GET",
      url: `/api/characters/${characterId}/pdf`,
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(pdf.statusCode).toBe(200);
  });

  it("returns existing for an active duplicate", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie);
    expect(created.statusCode).toBe(201);
    const second = await upload(bytes, owner.cookie);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      templateId: created.json().templateId,
      existing: true,
    });
  });

  it("does not create two active rows for parallel uploads", async () => {
    const bytes = await editablePdf();
    const [first, second] = await Promise.all([
      upload(bytes, owner.cookie),
      upload(bytes, owner.cookie),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 201]);
    expect(first.json().templateId).toBe(second.json().templateId);
    const rows = await testDb.db
      .selectFrom("pdf_templates")
      .select("id")
      .where("deleted_at", "is", null)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it("does not restore another owner's deleted template", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie);
    await trashTemplate(created.json().templateId as string);

    const strangerUpload = await upload(bytes, stranger.cookie);
    expect(strangerUpload.statusCode).toBe(201);
    expect(strangerUpload.json().templateId).not.toBe(
      created.json().templateId,
    );

    const ownerRow = await testDb.db
      .selectFrom("pdf_templates")
      .select(["id", "owner_id", "deleted_at"])
      .where("id", "=", created.json().templateId as string)
      .executeTakeFirstOrThrow();
    expect(ownerRow.owner_id).toBe(owner.userId);
    expect(ownerRow.deleted_at).not.toBeNull();
  });

  it("creates a fresh template when the deleted duplicate file is purged", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie);
    const oldTemplateId = created.json().templateId as string;
    await trashTemplate(oldTemplateId);
    await testDb.db
      .updateTable("object_files")
      .set({ state: "deleting" })
      .execute();

    const second = await upload(bytes, owner.cookie);
    expect(second.statusCode).toBe(201);
    expect(second.json().templateId).not.toBe(oldTemplateId);

    const rows = await testDb.db
      .selectFrom("pdf_templates")
      .select(["id", "deleted_at"])
      .orderBy("created_at")
      .execute();
    expect(rows).toHaveLength(2);
    expect(rows[0].deleted_at).not.toBeNull();
    expect(rows[1].deleted_at).toBeNull();
  });

  it("creates a fresh template when the deleted duplicate file is physically missing", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie);
    const oldTemplateId = created.json().templateId as string;
    await trashTemplate(oldTemplateId);
    const file = await testDb.db
      .selectFrom("object_files")
      .select("storage_key")
      .executeTakeFirstOrThrow();
    await new FilesystemStorage(storageRoot).delete(file.storage_key);

    const second = await upload(bytes, owner.cookie);
    expect(second.statusCode).toBe(201);
    expect(second.json().templateId).not.toBe(oldTemplateId);
  });

  it("refuses manual restore when the physical PDF is missing", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie);
    const templateId = created.json().templateId as string;
    await trashTemplate(templateId);
    const file = await testDb.db
      .selectFrom("object_files")
      .select("storage_key")
      .where("storage_key", "like", `%${templateId}%`)
      .executeTakeFirstOrThrow();
    await new FilesystemStorage(storageRoot).delete(file.storage_key);

    const restored = await app.inject({
      method: "POST",
      url: `/api/templates/${templateId}/restore`,
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(restored.statusCode).toBe(409);
    expect(restored.json().error.code).toBe("TEMPLATE_FILE_UNAVAILABLE");

    const row = await testDb.db
      .selectFrom("pdf_templates")
      .select("deleted_at")
      .where("id", "=", templateId)
      .executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
  });

  it("restores the owner's trashed template before suggesting a community duplicate", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie);
    const templateId = created.json().templateId as string;
    await trashTemplate(templateId);

    const community = await upload(bytes, stranger.cookie, {
      forceDuplicate: true,
      publishCommunity: true,
      title: "Community copy",
    });
    expect(community.statusCode).toBe(201);
    await approveTemplate(community.json().templateId as string);

    const restored = await upload(bytes, owner.cookie, { title: "Owner copy" });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ templateId, restored: true });
  });

  it("lists trashed templates for the owner only and restores them", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie);
    const templateId = created.json().templateId as string;
    await trashTemplate(templateId);

    const ownerTrash = await app.inject({
      method: "GET",
      url: "/api/templates?scope=trash",
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(ownerTrash.statusCode).toBe(200);
    expect(ownerTrash.json().items).toEqual([
      expect.objectContaining({ id: templateId, deletedAt: expect.any(String) }),
    ]);

    const strangerTrash = await app.inject({
      method: "GET",
      url: "/api/templates?scope=trash",
      cookies: { mycharacter_session: stranger.cookie },
    });
    expect(strangerTrash.json().items).toEqual([]);

    const ownerMine = await app.inject({
      method: "GET",
      url: "/api/templates?scope=mine",
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(ownerMine.json().items).toEqual([]);

    const restored = await app.inject({
      method: "POST",
      url: `/api/templates/${templateId}/restore`,
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ id: templateId });
  });

  it("expires trashed templates after 30 days", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie);
    const templateId = created.json().templateId as string;
    await trashTemplate(templateId);
    await testDb.db
      .updateTable("pdf_templates")
      .set({ deleted_at: new Date(Date.now() - 31 * 86_400_000) })
      .where("id", "=", templateId)
      .execute();

    const trash = await app.inject({
      method: "GET",
      url: "/api/templates?scope=trash",
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(trash.json().items).toEqual([]);

    const restore = await app.inject({
      method: "POST",
      url: `/api/templates/${templateId}/restore`,
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(restore.statusCode).toBe(404);
  });

  it("creates a fresh template when re-uploading an expired trash item", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie);
    const oldTemplateId = created.json().templateId as string;
    await trashTemplate(oldTemplateId);
    await testDb.db
      .updateTable("pdf_templates")
      .set({ deleted_at: new Date(Date.now() - 31 * 86_400_000) })
      .where("id", "=", oldTemplateId)
      .execute();

    const reuploaded = await upload(bytes, owner.cookie);
    expect(reuploaded.statusCode).toBe(201);
    expect(reuploaded.json().templateId).not.toBe(oldTemplateId);
    expect(reuploaded.json().restored).toBe(false);
  });

  it("refuses to restore a trashed row when an active duplicate exists", async () => {
    const bytes = await editablePdf();
    const created = await upload(bytes, owner.cookie);
    const oldTemplateId = created.json().templateId as string;
    await trashTemplate(oldTemplateId);
    await testDb.db
      .updateTable("object_files")
      .set({ state: "deleting" })
      .execute();
    const second = await upload(bytes, owner.cookie);
    const activeTemplateId = second.json().templateId as string;
    expect(activeTemplateId).not.toBe(oldTemplateId);
    await testDb.db
      .updateTable("object_files")
      .set({ state: "ready" })
      .where("storage_key", "like", `%${oldTemplateId}%`)
      .execute();

    const restore = await app.inject({
      method: "POST",
      url: `/api/templates/${oldTemplateId}/restore`,
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(restore.statusCode).toBe(409);
    expect(restore.json().error).toMatchObject({
      code: "TEMPLATE_DUPLICATE_ACTIVE",
      details: { activeTemplateId },
    });
  });

  async function upload(
    bytes: Uint8Array,
    cookie: string,
    options: {
      title?: string;
      gameSystem?: string;
      fileName?: string;
      publishCommunity?: boolean;
      forceDuplicate?: boolean;
    } = {},
  ) {
    const form = new FormData();
    form.set("title", options.title ?? "My system");
    form.set("gameSystem", options.gameSystem ?? "Test RPG");
    if (options.publishCommunity) form.set("publishCommunity", "true");
    if (options.forceDuplicate) form.set("forceDuplicate", "true");
    form.set(
      "file",
      new File([Buffer.from(bytes)], options.fileName ?? "sheet.pdf", {
        type: "application/pdf",
      }),
    );
    const encoded = new Response(form);
    return app.inject({
      method: "POST",
      url: "/api/templates",
      cookies: { mycharacter_session: cookie },
      headers: { "content-type": encoded.headers.get("content-type")! },
      payload: Buffer.from(await encoded.arrayBuffer()),
    });
  }

  async function trashTemplate(templateId: string) {
    const response = await app.inject({
      method: "DELETE",
      url: `/api/templates/${templateId}`,
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(response.statusCode).toBe(204);
  }

  async function seedField(templateId: string) {
    await testDb.db
      .insertInto("pdf_fields")
      .values({
        template_id: templateId,
        pdf_name: "name",
        kind: "text",
        auto_label: "Name",
        page: 1,
      })
      .execute();
  }

  async function approveTemplate(templateId: string) {
    await testDb.db
      .updateTable("pdf_templates")
      .set({ catalog_status: "ready", catalog_approved_at: new Date() })
      .where("id", "=", templateId)
      .execute();
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
