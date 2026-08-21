import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import type {
  ListSystemMaterialsResponse,
  SystemWorkspaceResponse,
} from "@mycharacter/contracts";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthService } from "../src/modules/auth/service.js";
import { PostService } from "../src/modules/posts/service.js";
import { SystemWorkspaceService } from "../src/modules/system-workspace/service.js";

const password = "correct horse battery staple";
const PDF_BYTES = Buffer.from("%PDF-1.4\n%test material\n%%EOF");
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const TEXT_BYTES = Buffer.from("just some plain text");

describe("system workspace", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let storageRoot: string;
  let db: Kysely<Database>;
  let ownerId: string;
  let strangerId: string;
  let ownerCookie: string;
  let strangerCookie: string;
  let templateId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db as unknown as Kysely<Database>;
    storageRoot = await mkdtemp(join(tmpdir(), "mycharacter-system-workspace-"));
    app = await buildApp({
      database: db,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storageRoot,
    });
    const auth = new AuthService(db);
    ownerId = (await auth.register("sw-owner@example.com", password)).id;
    strangerId = (await auth.register("sw-stranger@example.com", password)).id;
    ownerCookie = (await auth.login("sw-owner@example.com", password)).session
      .token;
    strangerCookie = (await auth.login("sw-stranger@example.com", password))
      .session.token;
    templateId = await seedTemplate(ownerId);
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
    await rm(storageRoot, { recursive: true, force: true });
  });

  async function seedTemplate(owner: string): Promise<string> {
    const file = await db
      .insertInto("object_files")
      .values({
        storage_key: `tests/${randomUUID()}.pdf`,
        sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
        size_bytes: "100",
        media_type: "application/pdf",
        state: "ready",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const template = await db
      .insertInto("pdf_templates")
      .values({
        file_id: file.id,
        owner_id: owner,
        visibility: "private",
        title: "Project system",
        slug: `project-system-${randomUUID().slice(0, 8)}`,
        storage_path: `tests/${randomUUID()}.pdf`,
        sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
        page_count: 1,
        catalog_status: "ready",
        catalog_approved_at: new Date(),
        is_public: false,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return String(template.id);
  }

  it("rejects a stranger from the workspace", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/systems/${templateId}/workspace`,
      cookies: { mycharacter_session: strangerCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it("uploads a PDF material and lists it in the workspace", async () => {
    const service = new SystemWorkspaceService(db, app.storage);
    const material = await service.uploadMaterial(ownerId, templateId, {
      title: "House rules",
      bytes: new Uint8Array(PDF_BYTES),
    });
    expect(material.fileType).toBe("pdf");
    expect(material.url).toContain(`/api/systems/${templateId}/materials/`);

    const response = await app.inject({
      method: "GET",
      url: `/api/systems/${templateId}/workspace`,
      cookies: { mycharacter_session: ownerCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as SystemWorkspaceResponse;
    expect(body.system.isOwner).toBe(true);
    expect(body.materials.map((m) => m.title)).toContain("House rules");
  });

  it("accepts images but rejects unsupported files", async () => {
    const service = new SystemWorkspaceService(db, app.storage);
    const image = await service.uploadMaterial(ownerId, templateId, {
      title: "Map",
      bytes: new Uint8Array(PNG_BYTES),
    });
    expect(image.fileType).toBe("image");

    await expect(
      service.uploadMaterial(ownerId, templateId, {
        title: "Notes",
        bytes: new Uint8Array(TEXT_BYTES),
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_MATERIAL_TYPE" });
  });

  it("lists materials through the API for the owner only", async () => {
    const ownerResponse = await app.inject({
      method: "GET",
      url: `/api/systems/${templateId}/materials`,
      cookies: { mycharacter_session: ownerCookie },
    });
    expect(ownerResponse.statusCode).toBe(200);
    const body = ownerResponse.json() as ListSystemMaterialsResponse;
    expect(body.materials.length).toBeGreaterThanOrEqual(2);

    const strangerResponse = await app.inject({
      method: "GET",
      url: `/api/systems/${templateId}/materials`,
      cookies: { mycharacter_session: strangerCookie },
    });
    expect(strangerResponse.statusCode).toBe(404);
  });

  it("deletes a material", async () => {
    const service = new SystemWorkspaceService(db, app.storage);
    const material = await service.uploadMaterial(ownerId, templateId, {
      title: "To delete",
      bytes: new Uint8Array(PDF_BYTES),
    });
    const response = await app.inject({
      method: "DELETE",
      url: `/api/systems/${templateId}/materials/${material.id}`,
      cookies: { mycharacter_session: ownerCookie },
    });
    expect(response.statusCode).toBe(200);

    const remaining = await service.listMaterials(ownerId, templateId);
    expect(remaining.materials.map((m) => m.id)).not.toContain(material.id);
  });

  it("files an owned post under the system and shows it in the workspace", async () => {
    const post = await new PostService(db).create(ownerId, [
      { type: "paragraph", data: { text: "Session notes" } },
    ]);

    const fileResponse = await app.inject({
      method: "PUT",
      url: `/api/posts/${post.id}/system`,
      cookies: { mycharacter_session: ownerCookie },
      payload: { systemId: templateId },
    });
    expect(fileResponse.statusCode).toBe(200);

    const workspaceResponse = await app.inject({
      method: "GET",
      url: `/api/systems/${templateId}/workspace`,
      cookies: { mycharacter_session: ownerCookie },
    });
    const body = workspaceResponse.json() as SystemWorkspaceResponse;
    expect(body.posts.map((p) => p.id)).toContain(post.id);
  });

  it("does not let a stranger file a post into someone else's system", async () => {
    const post = await new PostService(db).create(strangerId, [
      { type: "paragraph", data: { text: "Intruder" } },
    ]);
    const response = await app.inject({
      method: "PUT",
      url: `/api/posts/${post.id}/system`,
      cookies: { mycharacter_session: strangerCookie },
      payload: { systemId: templateId },
    });
    expect(response.statusCode).toBe(404);
  });
});
