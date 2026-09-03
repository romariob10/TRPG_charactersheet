import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import { sql, type Kysely } from "kysely";
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
  let storageRoot: string;
  let owner: Identity;
  let editor: Identity;
  let stranger: Identity;
  let templateId: string;
  let activeCharacterId: string;
  let trashedCharacterId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), "mycharacter-characters-"));
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storageRoot,
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
        slug: "test-system",
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
    await rm(storageRoot, { recursive: true, force: true });
  });

  it.each([
    ["owner", "edit", 200],
    ["editor", "edit", 200],
    ["editor", "invite", 403],
    ["stranger", "read", 404],
    ["owner", "restore", 200],
  ] as const)(
    "%s performing %s returns %i",
    async (identity, action, status) => {
      const actor = { owner, editor, stranger }[identity];
      const characterId =
        action === "restore" ? trashedCharacterId : activeCharacterId;
      const request =
        action === "edit"
          ? {
              method: "PATCH" as const,
              url: `/api/characters/${characterId}`,
              payload: { name: "Renamed hero" },
            }
          : action === "invite"
            ? {
                method: "POST" as const,
                url: `/api/characters/${characterId}/invites`,
              }
            : action === "restore"
              ? {
                  method: "POST" as const,
                  url: `/api/characters/${characterId}/restore`,
                }
              : {
                  method: "GET" as const,
                  url: `/api/characters/${characterId}`,
                };
      const response = await app.inject({
        ...request,
        cookies: { mycharacter_session: actor.cookie },
      });
      expect(response.statusCode).toBe(status);
    },
  );

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

  it("stores a character portrait in its bound field and protects the image", async () => {
    const system = await testDb.db
      .insertInto("game_systems")
      .values({
        owner_id: owner.userId,
        title: "Portrait system",
        slug: `portrait-${crypto.randomUUID().slice(0, 8)}`,
        visibility: "private",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const sheet = await testDb.db
      .insertInto("sheet_definitions")
      .values({
        system_id: system.id,
        owner_id: owner.userId,
        title: "Portrait sheet",
        slug: `portrait-sheet-${crypto.randomUUID().slice(0, 8)}`,
        kind: "character",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const version = await testDb.db
      .insertInto("sheet_versions")
      .values({
        sheet_definition_id: sheet.id,
        version_number: 1,
        layouts: JSON.stringify({}),
        fields: JSON.stringify([
          {
            id: crypto.randomUUID(),
            key: "portrait",
            label: "Portrait",
            kind: "avatar",
            options: [],
            readOnly: false,
          },
        ]),
        published_by: owner.userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const character = await testDb.db
      .insertInto("characters")
      .values({
        sheet_version_id: version.id,
        system_id: system.id,
        owner_id: owner.userId,
        name: "Portrait hero",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await testDb.db
      .insertInto("character_members")
      .values({
        character_id: character.id,
        user_id: editor.userId,
        role: "editor",
      })
      .execute();

    const form = new FormData();
    form.set(
      "file",
      new File(
        [
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
            "base64",
          ),
        ],
        "portrait.png",
        { type: "image/png" },
      ),
    );
    const encoded = new Response(form);
    const uploaded = await app.inject({
      method: "POST",
      url: `/api/characters/${character.id}/images?fieldKey=portrait`,
      cookies: { mycharacter_session: owner.cookie },
      headers: { "content-type": encoded.headers.get("content-type")! },
      payload: Buffer.from(await encoded.arrayBuffer()),
    });

    expect(uploaded.statusCode, uploaded.body).toBe(201);
    const imageUrl = uploaded.json().file.url as string;
    const stored = await testDb.db
      .selectFrom("character_sheet_field_values")
      .select("value")
      .where("character_id", "=", character.id)
      .where("field_key", "=", "portrait")
      .executeTakeFirstOrThrow();
    expect(stored.value).toBe(imageUrl);

    const ownerImage = await app.inject({
      method: "GET",
      url: imageUrl,
      cookies: { mycharacter_session: owner.cookie },
    });
    const editorImage = await app.inject({
      method: "GET",
      url: imageUrl,
      cookies: { mycharacter_session: editor.cookie },
    });
    const strangerImage = await app.inject({
      method: "GET",
      url: imageUrl,
      cookies: { mycharacter_session: stranger.cookie },
    });
    expect(ownerImage.statusCode).toBe(200);
    expect(editorImage.statusCode).toBe(200);
    expect(strangerImage.statusCode).toBe(404);
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
    expect(stored.token_hash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
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
      fields: [
        {
          id: field.id,
          label: "Character name",
          value: "Arven",
          version: 3,
          widgets: [{ rect: [0.1, 0.2, 0.3, 0.4] }],
        },
      ],
    });
  });

  it("rolls back character creation when workspace activity cannot be recorded", async () => {
    await sql
      .raw(
        `
      create function reject_character_workspace_activity()
      returns trigger language plpgsql as $$
      begin
        if new.kind = 'character' then
          raise exception 'forced workspace activity failure';
        end if;
        return new;
      end;
      $$
    `,
      )
      .execute(testDb.db);
    await sql
      .raw(
        `
      create trigger reject_character_workspace_activity
      before insert on workspace_items
      for each row execute function reject_character_workspace_activity()
    `,
      )
      .execute(testDb.db);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/characters",
        cookies: { mycharacter_session: owner.cookie },
        payload: { name: "Atomic hero", templateId },
      });

      expect(response.statusCode).toBe(500);
      const created = await testDb.db
        .selectFrom("characters")
        .select("id")
        .where("owner_id", "=", owner.userId)
        .where("template_id", "=", templateId)
        .where("name", "=", "Atomic hero")
        .execute();
      expect(created).toEqual([]);
    } finally {
      await sql
        .raw(
          "drop trigger if exists reject_character_workspace_activity on workspace_items",
        )
        .execute(testDb.db);
      await sql
        .raw("drop function if exists reject_character_workspace_activity()")
        .execute(testDb.db);
    }
  });

  async function register(email: string): Promise<Identity> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password },
    });
    const cookie = response.cookies.find(
      (item) => item.name === "mycharacter_session",
    );
    return { userId: response.json().user.id, cookie: cookie!.value };
  }
});
