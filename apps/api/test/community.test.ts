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

describe("template likes and comments", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let author: Identity;
  let viewer: Identity;
  let admin: Identity;
  let publicTemplateId: string;
  let privateTemplateId: string;
  let slug: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
    });
    author = await register("author.community@example.com");
    viewer = await register("viewer.community@example.com");
    admin = await register("admin.community@example.com");
    await testDb.db
      .updateTable("profiles")
      .set({ is_admin: true })
      .where("id", "=", admin.userId)
      .execute();
  });

  beforeEach(async () => {
    await testDb.db.deleteFrom("template_comments").execute();
    await testDb.db.deleteFrom("template_likes").execute();
    await testDb.db.deleteFrom("template_subscriptions").execute();
    await testDb.db.deleteFrom("characters").execute();
    await testDb.db.deleteFrom("pdf_templates").execute();
    await testDb.db.deleteFrom("object_files").execute();
    slug = `sheet-${crypto.randomUUID().slice(0, 8)}`;
    publicTemplateId = await seedTemplate({ isPublic: true, approved: true, slug });
    privateTemplateId = await seedTemplate({ isPublic: false, approved: true });
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
  });

  it("likes are idempotent and counted once", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await app.inject({
        method: "PUT",
        url: `/api/templates/${publicTemplateId}/like`,
        cookies: { mycharacter_session: viewer.cookie },
      });
      expect(response.statusCode).toBe(204);
    }
    const rows = await testDb.db
      .selectFrom("template_likes")
      .select("user_id")
      .execute();
    expect(rows).toHaveLength(1);

    const details = await app.inject({
      method: "GET",
      url: `/api/community/${await authorUsername()}/${slug}`,
    });
    expect(details.json().template).toMatchObject({
      likeCount: 1,
      likedByMe: false,
    });

    const likedDetails = await app.inject({
      method: "GET",
      url: `/api/community/${await authorUsername()}/${slug}`,
      cookies: { mycharacter_session: viewer.cookie },
    });
    expect(likedDetails.json().template).toMatchObject({
      likeCount: 1,
      likedByMe: true,
    });
  });

  it("unlike is idempotent and brings the count to zero", async () => {
    await app.inject({
      method: "PUT",
      url: `/api/templates/${publicTemplateId}/like`,
      cookies: { mycharacter_session: viewer.cookie },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await app.inject({
        method: "DELETE",
        url: `/api/templates/${publicTemplateId}/like`,
        cookies: { mycharacter_session: viewer.cookie },
      });
      expect(response.statusCode).toBe(204);
    }
    const rows = await testDb.db.selectFrom("template_likes").select("user_id").execute();
    expect(rows).toHaveLength(0);
    const list = await app.inject({
      method: "GET",
      url: "/api/templates?scope=community",
      cookies: { mycharacter_session: viewer.cookie },
    });
    const item = list.json().items.find(
      (candidate: { id: string }) => candidate.id === publicTemplateId,
    );
    expect(item.likeCount).toBe(0);
  });

  it("requires authentication for likes and comment creation", async () => {
    expect(
      (await app.inject({ method: "PUT", url: `/api/templates/${publicTemplateId}/like` }))
        .statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: "DELETE", url: `/api/templates/${publicTemplateId}/like` }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/templates/${publicTemplateId}/comments`,
          payload: { body: "hello" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/templates/${publicTemplateId}/comments/${crypto.randomUUID()}`,
        })
      ).statusCode,
    ).toBe(401);
  });

  it("serves details and comments without a session", async () => {
    await seedComment(publicTemplateId, viewer.userId, "Nice mapping!");
    const details = await app.inject({
      method: "GET",
      url: `/api/community/${await authorUsername()}/${slug}`,
    });
    expect(details.statusCode).toBe(200);
    expect(details.json().template).toMatchObject({
      id: publicTemplateId,
      commentCount: 1,
      author: { username: await authorUsername() },
    });

    const comments = await app.inject({
      method: "GET",
      url: `/api/templates/${publicTemplateId}/comments`,
    });
    expect(comments.statusCode).toBe(200);
    expect(comments.json().items).toHaveLength(1);
    expect(comments.json().items[0].body).toBe("Nice mapping!");
    expect(comments.json().items[0].author.username).toBe(await viewerUsername());
  });

  it.each([
    ["private", (ctx: Context) => ctx.privateTemplateId],
    ["unapproved", (ctx: Context) => ctx.unapprovedTemplateId],
    ["deleted", (ctx: Context) => ctx.deletedTemplateId],
  ])("hides %s templates behind 404", async (scenario, pick) => {
    const unapprovedTemplateId = await seedTemplate({ isPublic: true, approved: false });
    const deletedTemplateId = await seedTemplate({ isPublic: true, approved: true });
    await testDb.db
      .updateTable("pdf_templates")
      .set({ deleted_at: new Date() })
      .where("id", "=", deletedTemplateId)
      .execute();
    const templateId = pick({
      privateTemplateId,
      unapprovedTemplateId,
      deletedTemplateId,
    });

    const details = await app.inject({
      method: "GET",
      url: `/api/community/${await authorUsername()}/${await slugOf(templateId)}`,
    });
    expect(details.statusCode).toBe(404);
    const like = await app.inject({
      method: "PUT",
      url: `/api/templates/${templateId}/like`,
      cookies: { mycharacter_session: viewer.cookie },
    });
    expect(like.statusCode).toBe(404);
    const comments = await app.inject({
      method: "GET",
      url: `/api/templates/${templateId}/comments`,
    });
    expect(comments.statusCode).toBe(404);
    const comment = await app.inject({
      method: "POST",
      url: `/api/templates/${templateId}/comments`,
      cookies: { mycharacter_session: viewer.cookie },
      payload: { body: "hidden?" },
    });
    expect(comment.statusCode).toBe(404);
  });

  it("validates comment bodies", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/api/templates/${publicTemplateId}/comments`,
      cookies: { mycharacter_session: viewer.cookie },
      payload: { body: "   trimmed body   " },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().body).toBe("trimmed body");

    const empty = await app.inject({
      method: "POST",
      url: `/api/templates/${publicTemplateId}/comments`,
      cookies: { mycharacter_session: viewer.cookie },
      payload: { body: "    " },
    });
    expect(empty.statusCode).toBe(400);

    const tooLong = await app.inject({
      method: "POST",
      url: `/api/templates/${publicTemplateId}/comments`,
      cookies: { mycharacter_session: viewer.cookie },
      payload: { body: "x".repeat(2001) },
    });
    expect(tooLong.statusCode).toBe(400);
  });

  it("lets only the author or an admin delete a comment", async () => {
    const commentId = await seedComment(publicTemplateId, viewer.userId, "To be deleted");

    const strangerDelete = await app.inject({
      method: "DELETE",
      url: `/api/templates/${publicTemplateId}/comments/${commentId}`,
      cookies: { mycharacter_session: author.cookie },
    });
    expect(strangerDelete.statusCode).toBe(403);
    expect(strangerDelete.json().error.code).toBe("COMMENT_FORBIDDEN");

    const adminDelete = await app.inject({
      method: "DELETE",
      url: `/api/templates/${publicTemplateId}/comments/${commentId}`,
      cookies: { mycharacter_session: admin.cookie },
    });
    expect(adminDelete.statusCode).toBe(204);

    const secondCommentId = await seedComment(publicTemplateId, viewer.userId, "Mine");
    const authorDelete = await app.inject({
      method: "DELETE",
      url: `/api/templates/${publicTemplateId}/comments/${secondCommentId}`,
      cookies: { mycharacter_session: viewer.cookie },
    });
    expect(authorDelete.statusCode).toBe(204);
  });

  it("paginates comments with a stable cursor", async () => {
    for (let index = 0; index < 25; index++) {
      await seedComment(publicTemplateId, viewer.userId, `Comment ${index}`);
    }
    const firstPage = await app.inject({
      method: "GET",
      url: `/api/templates/${publicTemplateId}/comments?limit=20`,
    });
    const first = firstPage.json();
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toEqual(expect.any(String));

    const secondPage = await app.inject({
      method: "GET",
      url: `/api/templates/${publicTemplateId}/comments?limit=20&cursor=${first.nextCursor}`,
    });
    const second = secondPage.json();
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const ids = new Set([...first.items, ...second.items].map((item: { id: string }) => item.id));
    expect(ids.size).toBe(25);

    const invalidCursor = await app.inject({
      method: "GET",
      url: `/api/templates/${publicTemplateId}/comments?cursor=not-a-cursor`,
    });
    expect(invalidCursor.statusCode).toBe(400);
  });

  it("community list returns author, slug and counts in one response", async () => {
    await testDb.db
      .insertInto("template_likes")
      .values([
        { user_id: viewer.userId, template_id: publicTemplateId },
        { user_id: admin.userId, template_id: publicTemplateId },
      ])
      .execute();
    await seedComment(publicTemplateId, viewer.userId, "First");

    const list = await app.inject({
      method: "GET",
      url: "/api/templates?scope=community",
      cookies: { mycharacter_session: viewer.cookie },
    });
    expect(list.statusCode).toBe(200);
    const item = list.json().items.find(
      (candidate: { id: string }) => candidate.id === publicTemplateId,
    );
    expect(item).toMatchObject({
      slug,
      likeCount: 2,
      commentCount: 1,
      likedByMe: true,
      author: { username: await authorUsername() },
    });
    expect(item.author).not.toHaveProperty("email");
  });

  it("counts received likes on the public profile", async () => {
    await testDb.db
      .insertInto("template_likes")
      .values({ user_id: viewer.userId, template_id: publicTemplateId })
      .execute();
    const profile = await app.inject({
      method: "GET",
      url: `/api/profiles/${await authorUsername()}`,
    });
    expect(profile.json().profile).toMatchObject({
      publicTemplateCount: 1,
      totalLikes: 1,
    });
  });

  it("rate limits comment creation per user", async () => {
    const commenter = await register("spammer.community@example.com");
    const responses = await Promise.all(
      Array.from({ length: 11 }, () =>
        app.inject({
          method: "POST",
          url: `/api/templates/${publicTemplateId}/comments`,
          cookies: { mycharacter_session: commenter.cookie },
          payload: { body: "flood" },
        }),
      ),
    );
    const statuses = responses.map((response) => response.statusCode).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
  });

  interface Context {
    privateTemplateId: string;
    unapprovedTemplateId: string;
    deletedTemplateId: string;
  }

  let addressCounter = 1;
  async function register(email: string): Promise<Identity> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password },
      remoteAddress: `10.8.${Math.floor(addressCounter / 250)}.${addressCounter++ % 250}`,
    });
    return {
      userId: response.json().user.id as string,
      cookie: response.cookies.find((item) => item.name === "mycharacter_session")!.value,
    };
  }

  async function seedTemplate(options: {
    isPublic: boolean;
    approved: boolean;
    slug?: string;
  }): Promise<string> {
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
        owner_id: author.userId,
        visibility: "private",
        title: options.isPublic ? "Community sheet" : "Hidden sheet",
        slug: options.slug ?? `hidden-${crypto.randomUUID().slice(0, 8)}`,
        storage_path: `tests/${crypto.randomUUID()}.pdf`,
        sha256: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
        page_count: 1,
        catalog_status: "ready",
        catalog_approved_at: options.approved ? new Date() : null,
        is_public: options.isPublic,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return template.id;
  }

  async function seedComment(
    templateId: string,
    authorId: string,
    body: string,
  ): Promise<string> {
    const comment = await testDb.db
      .insertInto("template_comments")
      .values({ template_id: templateId, author_id: authorId, body })
      .returning("id")
      .executeTakeFirstOrThrow();
    return comment.id;
  }

  async function authorUsername(): Promise<string> {
    const profile = await testDb.db
      .selectFrom("profiles")
      .select("username")
      .where("id", "=", author.userId)
      .executeTakeFirstOrThrow();
    return profile.username;
  }

  async function viewerUsername(): Promise<string> {
    const profile = await testDb.db
      .selectFrom("profiles")
      .select("username")
      .where("id", "=", viewer.userId)
      .executeTakeFirstOrThrow();
    return profile.username;
  }

  async function slugOf(templateId: string): Promise<string> {
    const template = await testDb.db
      .selectFrom("pdf_templates")
      .select("slug")
      .where("id", "=", templateId)
      .executeTakeFirstOrThrow();
    return template.slug;
  }
});
