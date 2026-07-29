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

describe("template visibility and subscriptions", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let owner: Identity;
  let subscriber: Identity;
  let stranger: Identity;
  let privateTemplateId: string;
  let communityTemplateId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
    });
    owner = await register("owner.templates@example.com");
    subscriber = await register("subscriber.templates@example.com");
    stranger = await register("stranger.templates@example.com");
  });

  beforeEach(async () => {
    await testDb.db.deleteFrom("template_subscriptions").execute();
    await testDb.db.deleteFrom("characters").execute();
    await testDb.db.deleteFrom("pdf_templates").execute();
    await testDb.db.deleteFrom("object_files").execute();
    privateTemplateId = await seedTemplate(false);
    communityTemplateId = await seedTemplate(true);
    await testDb.db
      .insertInto("template_subscriptions")
      .values({ user_id: subscriber.userId, template_id: communityTemplateId })
      .execute();
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
  });

  it.each([
    ["private template", "owner", 200],
    ["private template", "stranger", 404],
    ["public community template", "stranger", 200],
    ["subscribed community template", "subscriber", 200],
    ["edit another user's template", "stranger", 404],
  ] as const)("%s as %s returns %i", async (scenario, identity, status) => {
    const actor = { owner, subscriber, stranger }[identity];
    const isPrivate = scenario === "private template" || scenario === "edit another user's template";
    const templateId = isPrivate ? privateTemplateId : communityTemplateId;
    const response = await app.inject({
      method: scenario === "edit another user's template" ? "PATCH" : "GET",
      url: `/api/templates/${templateId}`,
      cookies: { mycharacter_session: actor.cookie },
      ...(scenario === "edit another user's template"
        ? { payload: { title: "Stolen title" } }
        : {}),
    });
    expect(response.statusCode).toBe(status);
  });

  it("lists owned, subscribed, and community templates without leaking private ones", async () => {
    const mine = await app.inject({
      method: "GET",
      url: "/api/templates?scope=mine",
      cookies: { mycharacter_session: owner.cookie },
    });
    const subscribed = await app.inject({
      method: "GET",
      url: "/api/templates?scope=mine",
      cookies: { mycharacter_session: subscriber.cookie },
    });
    const community = await app.inject({
      method: "GET",
      url: "/api/templates?scope=community",
      cookies: { mycharacter_session: stranger.cookie },
    });

    expect(mine.statusCode).toBe(200);
    expect(mine.json().items.map((item: { id: string }) => item.id)).toContain(privateTemplateId);
    expect(subscribed.json().items.map((item: { id: string }) => item.id)).toContain(communityTemplateId);
    expect(community.json().items.map((item: { id: string }) => item.id)).toEqual([communityTemplateId]);
  });

  it("hides a previously subscribed template after its owner unpublishes it", async () => {
    await testDb.db
      .updateTable("pdf_templates")
      .set({ is_public: false })
      .where("id", "=", communityTemplateId)
      .execute();

    const direct = await app.inject({
      method: "GET",
      url: `/api/templates/${communityTemplateId}`,
      cookies: { mycharacter_session: subscriber.cookie },
    });
    const mine = await app.inject({
      method: "GET",
      url: "/api/templates?scope=mine",
      cookies: { mycharacter_session: subscriber.cookie },
    });

    expect(direct.statusCode).toBe(404);
    expect(mine.json().items).toEqual([]);
  });

  it("returns owner-only template editor metadata from PostgreSQL", async () => {
    const field = await testDb.db
      .insertInto("pdf_fields")
      .values({
        template_id: privateTemplateId,
        pdf_name: "Strength",
        kind: "text",
        auto_label: "Strength",
        page: 1,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const ownerResponse = await app.inject({
      method: "GET",
      url: `/api/templates/${privateTemplateId}/editor`,
      cookies: { mycharacter_session: owner.cookie },
    });
    const strangerResponse = await app.inject({
      method: "GET",
      url: `/api/templates/${privateTemplateId}/editor`,
      cookies: { mycharacter_session: stranger.cookie },
    });

    expect(ownerResponse.statusCode).toBe(200);
    expect(ownerResponse.json()).toMatchObject({
      id: privateTemplateId,
      pdfUrl: `/api/templates/${privateTemplateId}/pdf`,
      fields: [{ id: field.id, label: "Strength", enabled: true }],
    });
    expect(strangerResponse.statusCode).toBe(404);
  });

  it("updates an owned field as a manual override and clears approval", async () => {
    const field = await testDb.db
      .insertInto("pdf_fields")
      .values({
        template_id: privateTemplateId,
        pdf_name: "Strength",
        kind: "text",
        auto_label: "Strength",
        page: 1,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const response = await app.inject({
      method: "PATCH",
      url: `/api/templates/${privateTemplateId}/fields/${field.id}`,
      cookies: { mycharacter_session: owner.cookie },
      payload: {
        label: "Сила",
        aliases: ["STR"],
        section: "Характеристики",
        groupId: null,
        groupOrder: null,
        enabled: true,
      },
    });
    const strangerResponse = await app.inject({
      method: "PATCH",
      url: `/api/templates/${privateTemplateId}/fields/${field.id}`,
      cookies: { mycharacter_session: stranger.cookie },
      payload: {
        label: "Stolen",
        aliases: [],
        section: null,
        groupId: null,
        groupOrder: null,
        enabled: true,
      },
    });
    const stored = await testDb.db
      .selectFrom("pdf_fields")
      .select(["auto_label as label", "confidence", "source"])
      .where("id", "=", field.id)
      .executeTakeFirstOrThrow();
    const template = await testDb.db
      .selectFrom("pdf_templates")
      .select("catalog_approved_at as approvedAt")
      .where("id", "=", privateTemplateId)
      .executeTakeFirstOrThrow();

    expect(response.statusCode).toBe(200);
    expect(response.json().field).toMatchObject({
      id: field.id,
      label: "Сила",
      aliases: ["STR"],
      source: "manual",
      confidence: 1,
    });
    expect(strangerResponse.statusCode).toBe(404);
    expect(stored).toMatchObject({
      label: "Сила",
      confidence: 1,
      source: "manual",
    });
    expect(template.approvedAt).toBeNull();
  });

  it("requires at least one enabled field before approval", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/templates/${privateTemplateId}/approve`,
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("TEMPLATE_FIELDS_REQUIRED");
  });

  async function seedTemplate(isPublic: boolean): Promise<string> {
    const file = await testDb.db
      .insertInto("object_files")
      .values({
        storage_key: `tests/${crypto.randomUUID()}.pdf`,
        sha256: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
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
        title: isPublic ? "Community system" : "Private system",
        storage_path: `tests/${crypto.randomUUID()}.pdf`,
        sha256: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
        page_count: 1,
        catalog_status: "ready",
        catalog_approved_at: new Date(),
        is_public: isPublic,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return template.id;
  }

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
