import { mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const password = "correct horse battery staple";

describe("social posts", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let storageRoot: string;
  let user: { id: string; cookie: string; username: string };

  beforeAll(async () => {
    testDb = await createTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), "mycharacter-posts-"));
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storageRoot,
    });
    const registered = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "post-author@example.com", password },
      remoteAddress: "10.44.0.1",
    });
    const id = registered.json().user.id as string;
    const profile = await testDb.db
      .selectFrom("profiles")
      .select("username")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    user = {
      id,
      username: profile.username,
      cookie: registered.cookies.find(
        (item) => item.name === "mycharacter_session",
      )!.value,
    };
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("publishes structured content and exposes it in the live feed", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/posts",
      cookies: { mycharacter_session: user.cookie },
      payload: {
        blocks: [
          { type: "header", data: { text: "Session notes", level: 2 } },
          {
            type: "paragraph",
            data: { text: "We found <b>the hidden city</b>." },
          },
          {
            type: "list",
            data: { style: "unordered", items: ["Map", "Torch"] },
          },
        ],
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({
      title: "Session notes",
      author: { id: user.id, username: user.username },
      commentCount: 0,
    });
    expect(created.json().blocks[1].data.text).toBe(
      "We found the hidden city.",
    );

    const feed = await app.inject({
      method: "GET",
      url: "/api/posts",
      cookies: { mycharacter_session: user.cookie },
    });
    expect(feed.statusCode).toBe(200);
    expect(feed.json().posts.map((post: { id: string }) => post.id)).toContain(
      created.json().id,
    );

    const publicPost = await app.inject({
      method: "GET",
      url: `/api/public/posts/${user.username}/${created.json().slug}`,
    });
    expect(publicPost.statusCode).toBe(200);
    expect(publicPost.json().post.id).toBe(created.json().id);
  });

  it("updates reactions and comments without reloading the post", async () => {
    const created = await createTextPost("Reactions test");
    const postId = created.id as string;
    const reacted = await app.inject({
      method: "PUT",
      url: `/api/posts/${postId}/reactions/fire`,
      cookies: { mycharacter_session: user.cookie },
    });
    expect(reacted.statusCode).toBe(200);
    expect(reacted.json().reactions).toContainEqual({
      reaction: "fire",
      count: 1,
      reactedByMe: true,
    });

    const commented = await app.inject({
      method: "POST",
      url: `/api/posts/${postId}/comments`,
      cookies: { mycharacter_session: user.cookie },
      payload: { body: "Great session!" },
    });
    expect(commented.statusCode).toBe(201);
    expect(commented.json()).toMatchObject({
      body: "Great session!",
      author: { id: user.id },
    });
    const comments = await app.inject({
      method: "GET",
      url: `/api/posts/${postId}/comments`,
    });
    expect(comments.json().comments).toHaveLength(1);
  });

  it("embeds public characters and systems as hydrated interactive cards", async () => {
    const file = await testDb.db
      .insertInto("object_files")
      .values({
        storage_key: `tests/${randomUUID()}.pdf`,
        sha256: "c".repeat(64),
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
        owner_id: user.id,
        visibility: "private",
        title: "Expedition system",
        slug: `expedition-${randomUUID().slice(0, 8)}`,
        storage_path: `tests/${randomUUID()}.pdf`,
        sha256: "d".repeat(64),
        page_count: 2,
        catalog_status: "ready",
        catalog_approved_at: new Date(),
        is_public: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const character = await testDb.db
      .insertInto("characters")
      .values({
        template_id: template.id,
        owner_id: user.id,
        name: "Mira",
        is_public: true,
        published_at: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const options = await app.inject({
      method: "GET",
      url: "/api/posts/embed-options",
      cookies: { mycharacter_session: user.cookie },
    });
    expect(options.json()).toMatchObject({
      characters: [
        expect.objectContaining({ id: character.id, title: "Mira" }),
      ],
      systems: [
        expect.objectContaining({
          id: template.id,
          title: "Expedition system",
        }),
      ],
    });

    const post = await app.inject({
      method: "POST",
      url: "/api/posts",
      cookies: { mycharacter_session: user.cookie },
      payload: {
        blocks: [
          { type: "character", data: { characterId: character.id } },
          { type: "system", data: { templateId: template.id } },
        ],
      },
    });
    expect(post.statusCode, post.body).toBe(201);
    expect(post.json().embeds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "character",
          id: character.id,
          title: "Mira",
        }),
        expect.objectContaining({
          kind: "system",
          id: template.id,
          title: "Expedition system",
        }),
      ]),
    );
  });

  it("uploads an image privately and publishes it through a post", async () => {
    const form = new FormData();
    form.set(
      "image",
      new File(
        [Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB", "base64")],
        "pixel.png",
        { type: "image/png" },
      ),
    );
    const encoded = new Response(form);
    const uploaded = await app.inject({
      method: "POST",
      url: "/api/posts/images",
      cookies: { mycharacter_session: user.cookie },
      headers: { "content-type": encoded.headers.get("content-type")! },
      payload: Buffer.from(await encoded.arrayBuffer()),
    });
    expect(uploaded.statusCode).toBe(201);
    const fileId = uploaded.json().file.id as string;
    expect(
      (await app.inject({ method: "GET", url: `/api/post-images/${fileId}` }))
        .statusCode,
    ).toBe(404);

    const post = await app.inject({
      method: "POST",
      url: "/api/posts",
      cookies: { mycharacter_session: user.cookie },
      payload: {
        blocks: [{ type: "image", data: { fileId, caption: "Tiny map" } }],
      },
    });
    expect(post.statusCode, post.body).toBe(201);
    const image = await app.inject({
      method: "GET",
      url: `/api/post-images/${fileId}`,
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toBe("image/png");
  });

  async function createTextPost(text: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/posts",
      cookies: { mycharacter_session: user.cookie },
      payload: { blocks: [{ type: "paragraph", data: { text } }] },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json();
  }
});
