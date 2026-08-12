import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import type { Kysely } from "kysely";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const password = "correct horse battery staple";

describe("profiles, usernames and slugs", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let storageRoot: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), "mycharacter-profiles-"));
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storageRoot,
    });
  });

  beforeEach(async () => {
    await testDb.db.deleteFrom("template_subscriptions").execute();
    await testDb.db.deleteFrom("characters").execute();
    await testDb.db.deleteFrom("catalog_jobs").execute();
    await testDb.db.deleteFrom("pdf_fields").execute();
    await testDb.db.deleteFrom("pdf_templates").execute();
    await testDb.db.deleteFrom("object_files").execute();
    await testDb.db.deleteFrom("sessions").execute();
    await testDb.db.deleteFrom("profiles").execute();
    await testDb.db.deleteFrom("users").execute();
    await rm(storageRoot, { recursive: true, force: true });
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("assigns a username derived from the email local part on registration", async () => {
    const identity = await register("ivan.petrov.profiles@example.com");
    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me",
      cookies: { mycharacter_session: identity.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: identity.userId,
      email: "ivan.petrov.profiles@example.com",
      username: "ivan-petrov-profiles",
      bio: "",
    });
  });

  it("falls back to user-<uuid8> when the local part is unusable", async () => {
    const identity = await register("a@b.com");
    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/me",
      cookies: { mycharacter_session: identity.cookie },
    });
    expect(response.json().username).toMatch(
      /^user-[0-9a-f]{8}$/,
    );
  });

  it("resolves identical local parts with numeric suffixes", async () => {
    const first = await register("dup+one@example.com");
    const second = await register("dup.one@example.com");
    const [firstName, secondName] = await Promise.all(
      [first, second].map(async (identity) => {
        const response = await app.inject({
          method: "GET",
          url: "/api/profiles/me",
          cookies: { mycharacter_session: identity.cookie },
        });
        return response.json().username as string;
      }),
    );
    expect(firstName).toBe("dup-one");
    expect(secondName).toBe("dup-one-2");
  });

  it("serves public profiles without private fields", async () => {
    const identity = await register("author.profiles@example.com");
    await app.inject({
      method: "PATCH",
      url: "/api/profiles/me",
      cookies: { mycharacter_session: identity.cookie },
      payload: { displayName: "Ivan Petrov", bio: "Map maker" },
    });
    await seedTemplate(identity.userId, {
      isPublic: true,
      title: "Public sheet",
      slug: "public-sheet",
    });
    await seedTemplate(identity.userId, {
      isPublic: false,
      title: "Private sheet",
      slug: "private-sheet",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/profiles/author-profiles",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.profile).toMatchObject({
      username: "author-profiles",
      displayName: "Ivan Petrov",
      bio: "Map maker",
      publicTemplateCount: 1,
      totalLikes: 0,
    });
    expect(body.profile.joinedAt).toEqual(expect.any(String));
    expect(body).not.toHaveProperty("email");
    expect(body.profile).not.toHaveProperty("email");
    expect(body.profile).not.toHaveProperty("locale");
    expect(body.profile).not.toHaveProperty("isAdmin");
    expect(body.templates.map((template: { title: string }) => template.title)).toEqual([
      "Public sheet",
    ]);
    expect(body.templates[0]).toMatchObject({
      slug: "public-sheet",
      author: { username: "author-profiles", displayName: "Ivan Petrov" },
    });
  });

  it("returns 404 for unknown or malformed usernames", async () => {
    expect((await app.inject({ method: "GET", url: "/api/profiles/nobody-here" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/profiles/Bad%20Name" })).statusCode).toBe(404);
  });

  it("updates the profile and rejects taken usernames", async () => {
    const first = await register("editor.one@example.com");
    const second = await register("editor.two@example.com");

    const update = await app.inject({
      method: "PATCH",
      url: "/api/profiles/me",
      cookies: { mycharacter_session: first.cookie },
      payload: { username: "custom-name", displayName: "Editor", bio: "Hi" },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ username: "custom-name", displayName: "Editor", bio: "Hi" });

    const conflict = await app.inject({
      method: "PATCH",
      url: "/api/profiles/me",
      cookies: { mycharacter_session: second.cookie },
      payload: { username: "custom-name" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("USERNAME_TAKEN");

    const caseConflict = await app.inject({
      method: "PATCH",
      url: "/api/profiles/me",
      cookies: { mycharacter_session: second.cookie },
      payload: { username: "invalid uppercase" },
    });
    expect(caseConflict.statusCode).toBe(400);
  });

  it("requires authentication for /api/profiles/me", async () => {
    expect((await app.inject({ method: "GET", url: "/api/profiles/me" })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: "PATCH", url: "/api/profiles/me", payload: { bio: "x" } }))
        .statusCode,
    ).toBe(401);
  });

  it("community list returns author and slug in one response", async () => {
    const owner = await register("community.author@example.com");
    const stranger = await register("community.viewer@example.com");
    await seedTemplate(owner.userId, {
      isPublic: true,
      title: "Community sheet",
      slug: "community-sheet",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/templates?scope=community",
      cookies: { mycharacter_session: stranger.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items[0]).toMatchObject({
      title: "Community sheet",
      slug: "community-sheet",
      author: { username: "community-author", displayName: null },
    });
  });

  it("assigns slugs on upload and resolves collisions with suffixes", async () => {
    const identity = await register("slug.uploader@example.com");
    const first = await upload(await editablePdf("field_one"), identity.cookie, "D&D 5e");
    expect(first.statusCode).toBe(201);
    const second = await upload(await editablePdf("field_two"), identity.cookie, "D&D 5e");
    expect(second.statusCode).toBe(201);

    const [firstSlug, secondSlug] = await Promise.all(
      [first.json().templateId, second.json().templateId].map(async (templateId: string) => {
        const response = await app.inject({
          method: "GET",
          url: `/api/templates/${templateId}`,
          cookies: { mycharacter_session: identity.cookie },
        });
        return response.json().slug as string;
      }),
    );
    expect(firstSlug).toBe("d-d-5e");
    expect(secondSlug).toBe("d-d-5e-2");

    await app.inject({
      method: "PATCH",
      url: `/api/templates/${first.json().templateId}`,
      cookies: { mycharacter_session: identity.cookie },
      payload: { title: "Renamed sheet" },
    });
    const afterRename = await app.inject({
      method: "GET",
      url: `/api/templates/${first.json().templateId}`,
      cookies: { mycharacter_session: identity.cookie },
    });
    expect(afterRename.json()).toMatchObject({ title: "Renamed sheet", slug: "d-d-5e" });
  });

  it("continues allocating slug suffixes beyond five matching titles", async () => {
    const identity = await register("many.slugs@example.com");
    const slugs: string[] = [];
    for (let index = 1; index <= 6; index++) {
      const uploaded = await upload(
        await editablePdf(`field_${index}`),
        identity.cookie,
        "Repeated title",
      );
      expect(uploaded.statusCode).toBe(201);
      const template = await app.inject({
        method: "GET",
        url: `/api/templates/${uploaded.json().templateId}`,
        cookies: { mycharacter_session: identity.cookie },
      });
      slugs.push(template.json().slug as string);
    }
    expect(slugs).toEqual([
      "repeated-title",
      "repeated-title-2",
      "repeated-title-3",
      "repeated-title-4",
      "repeated-title-5",
      "repeated-title-6",
    ]);
  });

  let addressCounter = 1;
  async function register(email: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password },
      remoteAddress: `10.9.${Math.floor(addressCounter / 250)}.${addressCounter++ % 250}`,
    });
    return {
      userId: response.json().user.id as string,
      cookie: response.cookies.find((item) => item.name === "mycharacter_session")!.value,
    };
  }

  async function seedTemplate(
    ownerId: string,
    options: { isPublic: boolean; title: string; slug?: string },
  ): Promise<string> {
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
        owner_id: ownerId,
        visibility: "private",
        title: options.title,
        slug: options.slug ?? `seed-${crypto.randomUUID().slice(0, 8)}`,
        storage_path: `tests/${crypto.randomUUID()}.pdf`,
        sha256: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
        page_count: 1,
        catalog_status: "ready",
        catalog_approved_at: new Date(),
        is_public: options.isPublic,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return template.id;
  }

  async function upload(bytes: Uint8Array, cookie: string, title: string) {
    const form = new FormData();
    form.set("title", title);
    form.set("gameSystem", "Test RPG");
    form.set(
      "file",
      new File([Buffer.from(bytes)], "sheet.pdf", { type: "application/pdf" }),
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
});

async function editablePdf(fieldName: string): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([400, 400]);
  const field = document.getForm().createTextField(fieldName);
  field.addToPage(page, { x: 20, y: 20, width: 200, height: 24 });
  return document.save();
}
