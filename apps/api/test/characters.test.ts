import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const password = "correct horse battery staple";

interface Identity {
  userId: string;
  cookie: string;
}

describe("character authorization and lifecycle", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let owner: Identity;
  let editor: Identity;
  let stranger: Identity;
  let templateId: string;
  let activeCharacterId: string;
  let trashedCharacterId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
    });
    owner = await register("owner.characters@example.com");
    editor = await register("editor.characters@example.com");
    stranger = await register("stranger.characters@example.com");
  });

  beforeEach(async () => {
    await testDb.db.deleteFrom("character_invites").execute();
    await testDb.db.deleteFrom("character_values").execute();
    await testDb.db.deleteFrom("character_members").execute();
    await testDb.db.deleteFrom("characters").execute();
    await testDb.db.deleteFrom("template_subscriptions").execute();
    await testDb.db.deleteFrom("pdf_templates").execute();
    await testDb.db.deleteFrom("object_files").execute();

    const file = await testDb.db
      .insertInto("object_files")
      .values({
        storage_key: `tests/${crypto.randomUUID()}.pdf`,
        sha256: "a".repeat(64),
        size_bytes: "100",
        media_type: "application/pdf",
        state: "ready",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const template = await testDb.db
      .insertInto("pdf_templates")
      .values({
        file_id: file.id,
        owner_id: owner.userId,
        visibility: "private",
        title: "Test system",
        storage_path: `tests/${crypto.randomUUID()}.pdf`,
        sha256: "b".repeat(64),
        page_count: 2,
        catalog_status: "ready",
        catalog_approved_at: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    templateId = template.id;

    const active = await testDb.db
      .insertInto("characters")
      .values({
        template_id: templateId,
        owner_id: owner.userId,
        name: "Active hero",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    activeCharacterId = active.id;
    const trashed = await testDb.db
      .insertInto("characters")
      .values({
        template_id: templateId,
        owner_id: owner.userId,
        name: "Trashed hero",
        status: "trashed",
        deleted_at: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    trashedCharacterId = trashed.id;
    await testDb.db
      .insertInto("character_members")
      .values({
        character_id: activeCharacterId,
        user_id: editor.userId,
        role: "editor",
      })
      .execute();
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
  });

  it.each([
    ["owner", "edit", 200],
    ["editor", "edit", 200],
    ["editor", "invite", 403],
    ["stranger", "read", 404],
    ["owner", "restore", 200],
  ] as const)("%s performing %s returns %i", async (identity, action, status) => {
    const actor = { owner, editor, stranger }[identity];
    const characterId = action === "restore" ? trashedCharacterId : activeCharacterId;
    const request =
      action === "edit"
        ? { method: "PATCH" as const, url: `/api/characters/${characterId}`, payload: { name: "Renamed hero" } }
        : action === "invite"
          ? { method: "POST" as const, url: `/api/characters/${characterId}/invites` }
          : action === "restore"
            ? { method: "POST" as const, url: `/api/characters/${characterId}/restore` }
            : { method: "GET" as const, url: `/api/characters/${characterId}` };
    const response = await app.inject({
      ...request,
      cookies: { mycharacter_session: actor.cookie },
    });
    expect(response.statusCode).toBe(status);
  });

  it("shows a trashed character only to its owner", async () => {
    const ownerResponse = await app.inject({
      method: "GET",
      url: `/api/characters/${trashedCharacterId}`,
      cookies: { mycharacter_session: owner.cookie },
    });
    const editorResponse = await app.inject({
      method: "GET",
      url: `/api/characters/${trashedCharacterId}`,
      cookies: { mycharacter_session: editor.cookie },
    });

    expect(ownerResponse.statusCode).toBe(200);
    expect(editorResponse.statusCode).toBe(404);
  });

  it("returns 410 for an expired invite", async () => {
    const token = "expired-invite-token";
    await testDb.db
      .insertInto("character_invites")
      .values({
        character_id: activeCharacterId,
        token_hash: createHash("sha256").update(token).digest("hex"),
        created_by: owner.userId,
        expires_at: new Date(Date.now() - 60_000),
      })
      .execute();

    const response = await app.inject({
      method: "POST",
      url: "/api/invitations/accept",
      cookies: { mycharacter_session: stranger.cookie },
      payload: { token },
    });
    expect(response.statusCode).toBe(410);
  });

  it("returns 409 when an owner accepts an invite to their own character", async () => {
    const token = "owner-invite-token";
    await testDb.db
      .insertInto("character_invites")
      .values({
        character_id: activeCharacterId,
        token_hash: createHash("sha256").update(token).digest("hex"),
        created_by: owner.userId,
        expires_at: new Date(Date.now() + 60_000),
      })
      .execute();

    const response = await app.inject({
      method: "POST",
      url: "/api/invitations/accept",
      cookies: { mycharacter_session: owner.cookie },
      payload: { token },
    });
    expect(response.statusCode).toBe(409);
  });

  it("hashes new invite tokens and returns plaintext only once", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/characters/${activeCharacterId}/invites`,
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(response.statusCode).toBe(201);
    const token = response.json().token as string;
    const stored = await testDb.db
      .selectFrom("character_invites")
      .select("token_hash")
      .executeTakeFirstOrThrow();
    expect(stored.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(stored.token_hash).not.toBe(token);
  });

  it("returns local editor fields, widgets, values, and versions", async () => {
    const field = await testDb.db
      .insertInto("pdf_fields")
      .values({
        template_id: templateId,
        pdf_name: "CharacterName",
        kind: "text",
        auto_label: "Character name",
        page: 1,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await testDb.db
      .insertInto("pdf_field_widgets")
      .values({
        field_id: field.id,
        page: 1,
        rect: [0.1, 0.2, 0.3, 0.4],
        pdf_rect: [10, 20, 30, 40],
      })
      .execute();
    await testDb.db
      .insertInto("character_values")
      .values({
        character_id: activeCharacterId,
        field_id: field.id,
        value: JSON.stringify("Arven"),
        version: 3,
        updated_by: owner.userId,
      })
      .execute();

    const response = await app.inject({
      method: "GET",
      url: `/api/characters/${activeCharacterId}/editor`,
      cookies: { mycharacter_session: owner.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: activeCharacterId,
      currentUserId: owner.userId,
      pdfUrl: `/api/characters/${activeCharacterId}/pdf`,
      fields: [{
        id: field.id,
        label: "Character name",
        value: "Arven",
        version: 3,
        widgets: [{ rect: [0.1, 0.2, 0.3, 0.4] }],
      }],
    });
  });

  async function register(email: string): Promise<Identity> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password },
    });
    const cookie = response.cookies.find((item) => item.name === "mycharacter_session");
    return { userId: response.json().user.id, cookie: cookie!.value };
  }
});
