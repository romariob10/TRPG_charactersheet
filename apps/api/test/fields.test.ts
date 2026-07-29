import type { FastifyInstance } from "fastify";
import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
  type FieldKind,
} from "@mycharacter/database";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const password = "correct horse battery staple";

interface Identity {
  userId: string;
  cookie: string;
}

describe("field transactions", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let owner: Identity;
  let editor: Identity;
  let stranger: Identity;
  let templateId: string;
  let otherTemplateId: string;
  let characterId: string;
  let trashedCharacterId: string;
  const fields = new Map<FieldKind, string>();
  let otherFieldId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
    });
    owner = await register("owner.fields@example.com");
    editor = await register("editor.fields@example.com");
    stranger = await register("stranger.fields@example.com");
  });

  beforeEach(async () => {
    await testDb.db.deleteFrom("character_mutations").execute();
    await testDb.db.deleteFrom("character_values").execute();
    await testDb.db.deleteFrom("character_members").execute();
    await testDb.db.deleteFrom("characters").execute();
    await testDb.db.deleteFrom("pdf_fields").execute();
    await testDb.db.deleteFrom("pdf_templates").execute();
    await testDb.db.deleteFrom("object_files").execute();
    fields.clear();

    templateId = await createTemplate("fields-a");
    otherTemplateId = await createTemplate("fields-b");
    for (const [kind, options] of [
      ["text", []],
      ["multiline", []],
      ["checkbox", []],
      ["radio", ["A", "B"]],
      ["dropdown", ["One", "Two"]],
      ["list", ["Red", "Blue"]],
      ["button", []],
    ] as const) {
      const field = await testDb.db
        .insertInto("pdf_fields")
        .values({
          template_id: templateId,
          pdf_name: `field_${kind}`,
          kind,
          options: JSON.stringify(options),
          page: 1,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      fields.set(kind, field.id);
    }
    otherFieldId = (
      await testDb.db
        .insertInto("pdf_fields")
        .values({
          template_id: otherTemplateId,
          pdf_name: "other",
          kind: "text",
          page: 1,
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;

    characterId = await createCharacter("Active", "active");
    trashedCharacterId = await createCharacter("Trashed", "trashed");
    await testDb.db
      .insertInto("character_members")
      .values({
        character_id: characterId,
        user_id: editor.userId,
        role: "editor",
      })
      .execute();
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
  });

  it("returns the same result for an idempotent retry", async () => {
    const clientMutationId = crypto.randomUUID();
    const first = await save(owner, characterId, fields.get("text")!, {
      value: "Ada",
      expectedVersion: 0,
      clientMutationId,
    });
    const retry = await save(owner, characterId, fields.get("text")!, {
      value: "Ada",
      expectedVersion: 0,
      clientMutationId,
    });

    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());
    expect(await revision(characterId)).toBe("1");
    expect(await mutationCount()).toBe(1);
  });

  it("reports a stale normal autosave as overwritten", async () => {
    await save(owner, characterId, fields.get("text")!, mutation("Ada", 0));
    const response = await save(
      editor,
      characterId,
      fields.get("text")!,
      mutation("Borin", 0),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      value: "Borin",
      version: 2,
      revision: 2,
      overwrittenRemote: true,
      updatedBy: editor.userId,
    });
  });

  it.each([
    ["text", "Ada", 200],
    ["multiline", "line 1\nline 2", 200],
    ["checkbox", true, 200],
    ["radio", "A", 200],
    ["dropdown", "Two", 200],
    ["list", ["Red", "Blue"], 200],
    ["button", "click", 422],
    ["checkbox", "true", 422],
    ["radio", "missing", 422],
    ["dropdown", ["One"], 422],
  ] as const)("validates %s value %j", async (kind, value, status) => {
    const response = await save(
      owner,
      characterId,
      fields.get(kind)!,
      mutation(value, 0),
    );
    expect(response.statusCode).toBe(status);
    if (status === 422) expect(response.json().error.code).toBe("FIELD_VALUE_INVALID");
  });

  it("rejects a field from another template", async () => {
    const response = await save(owner, characterId, otherFieldId, mutation("Ada", 0));
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("FIELD_NOT_FOUND");
  });

  it("allows editors but hides characters from strangers", async () => {
    const editorResponse = await save(
      editor,
      characterId,
      fields.get("text")!,
      mutation("Editor", 0),
    );
    const strangerResponse = await save(
      stranger,
      characterId,
      fields.get("text")!,
      mutation("Stranger", 1),
    );
    expect(editorResponse.statusCode).toBe(200);
    expect(strangerResponse.statusCode).toBe(404);
  });

  it("does not mutate trashed characters", async () => {
    const response = await save(
      owner,
      trashedCharacterId,
      fields.get("text")!,
      mutation("Ada", 0),
    );
    expect(response.statusCode).toBe(403);
    expect(await revision(trashedCharacterId)).toBe("0");
  });

  it("serializes concurrent writes into distinct versions and revisions", async () => {
    const [first, second] = await Promise.all([
      save(owner, characterId, fields.get("text")!, mutation("Ada", 0)),
      save(editor, characterId, fields.get("text")!, mutation("Borin", 0)),
    ]);
    const results = [first.json(), second.json()] as Array<{
      version: number;
      revision: number;
    }>;
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(results.map((item) => item.version).sort()).toEqual([1, 2]);
    expect(results.map((item) => item.revision).sort()).toEqual([1, 2]);
    expect(await revision(characterId)).toBe("2");
    expect(await mutationCount()).toBe(2);
  });

  async function createTemplate(prefix: string): Promise<string> {
    const file = await testDb.db
      .insertInto("object_files")
      .values({
        storage_key: `templates/ab/${crypto.randomUUID()}/${crypto.randomUUID()}.pdf`,
        sha256: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
        size_bytes: "100",
        media_type: "application/pdf",
        state: "ready",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return (
      await testDb.db
        .insertInto("pdf_templates")
        .values({
          file_id: file.id,
          owner_id: owner.userId,
          visibility: "private",
          title: prefix,
          storage_path: `legacy/${crypto.randomUUID()}.pdf`,
          sha256: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
          page_count: 1,
          catalog_status: "ready",
          catalog_approved_at: new Date(),
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
  }

  async function createCharacter(name: string, status: "active" | "trashed") {
    return (
      await testDb.db
        .insertInto("characters")
        .values({
          template_id: templateId,
          owner_id: owner.userId,
          name,
          status,
          deleted_at: status === "trashed" ? new Date() : null,
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
  }

  function mutation(
    value: unknown,
    expectedVersion: number,
  ): Record<string, unknown> {
    return { value, expectedVersion, clientMutationId: crypto.randomUUID() };
  }

  async function save(
    identity: Identity,
    targetCharacterId: string,
    fieldId: string,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: "PUT",
      url: `/api/characters/${targetCharacterId}/fields/${fieldId}`,
      cookies: { mycharacter_session: identity.cookie },
      payload,
    });
  }

  async function revision(targetCharacterId: string) {
    return (
      await testDb.db
        .selectFrom("characters")
        .select("revision")
        .where("id", "=", targetCharacterId)
        .executeTakeFirstOrThrow()
    ).revision;
  }

  async function mutationCount() {
    return Number(
      (
        await testDb.db
          .selectFrom("character_mutations")
          .select((eb) => eb.fn.countAll<string>().as("count"))
          .executeTakeFirstOrThrow()
      ).count,
    );
  }

  async function register(email: string): Promise<Identity> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password },
    });
    return {
      userId: response.json().user.id,
      cookie: response.cookies.find((item) => item.name === "mycharacter_session")!.value,
    };
  }
});
