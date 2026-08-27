import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import type { ListWorkspaceHistoryResponse } from "@mycharacter/contracts";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthService } from "../src/modules/auth/service.js";
import { DirectMessageService } from "../src/modules/messages/service.js";
import { PostService } from "../src/modules/posts/service.js";

const password = "correct horse battery staple";

describe("workspace history", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let storageRoot: string;
  let db: Kysely<Database>;
  let aliceId: string;
  let bobId: string;
  let aliceCookie: string;
  let bobCookie: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db as unknown as Kysely<Database>;
    storageRoot = await mkdtemp(
      join(tmpdir(), "mycharacter-workspace-history-"),
    );
    app = await buildApp({
      database: db,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storageRoot,
    });
    const auth = new AuthService(db);
    aliceId = (await auth.register("ws-alice@example.com", password)).id;
    bobId = (await auth.register("ws-bob@example.com", password)).id;
    aliceCookie = (await auth.login("ws-alice@example.com", password)).session
      .token;
    bobCookie = (await auth.login("ws-bob@example.com", password)).session
      .token;
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
    await rm(storageRoot, { recursive: true, force: true });
  });

  async function listHistory(
    cookie: string,
  ): Promise<ListWorkspaceHistoryResponse> {
    const response = await app.inject({
      method: "GET",
      url: "/api/workspace/history",
      cookies: { mycharacter_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  it("starts empty", async () => {
    const body = await listHistory(aliceCookie);
    expect(body.items).toEqual([]);
  });

  it("adds a saved post and lets the owner pin it", async () => {
    const post = await new PostService(db).create(aliceId, [
      { type: "paragraph", data: { text: "A saved discussion" } },
    ]);
    await new PostService(db).bookmark(aliceId, post.id);

    let body = await listHistory(aliceCookie);
    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    expect(item.kind).toBe("post");
    expect(item.targetId).toBe(post.id);
    expect(item.pinned).toBe(false);
    expect(item.unread).toBe(false);
    expect(item.url).toContain("/posts/");

    const pin = await app.inject({
      method: "PUT",
      url: `/api/workspace/history/${item.id}/pin`,
      cookies: { mycharacter_session: aliceCookie },
      payload: { pinned: true },
    });
    expect(pin.statusCode).toBe(200);

    body = await listHistory(aliceCookie);
    expect(body.items[0].pinned).toBe(true);
  });

  it("marks an incoming conversation and its notification read when opened", async () => {
    const messages = new DirectMessageService(db);
    const conversationId = await messages.getOrCreateConversation(
      bobId,
      aliceId,
    );
    await messages.sendMessage(bobId, conversationId, "hey alice");

    let body = await listHistory(aliceCookie);
    const conversation = body.items.find((i) => i.kind === "conversation");
    expect(conversation).toBeDefined();
    expect(conversation?.unread).toBe(true);
    expect(conversation?.subtitle).toBe("hey alice");

    const opened = await app.inject({
      method: "GET",
      url: `/api/messages/conversations/${conversationId}`,
      cookies: { mycharacter_session: aliceCookie },
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json().messages[0].readAt).not.toBeNull();

    body = await listHistory(aliceCookie);
    const seen = body.items.find((i) => i.kind === "conversation");
    expect(seen?.unread).toBe(false);

    const conversations = await app.inject({
      method: "GET",
      url: "/api/messages/conversations",
      cookies: { mycharacter_session: aliceCookie },
    });
    expect(conversations.statusCode).toBe(200);
    expect(conversations.json().conversations[0].unreadCount).toBe(0);

    const notifications = await app.inject({
      method: "GET",
      url: "/api/notifications",
      cookies: { mycharacter_session: aliceCookie },
    });
    expect(notifications.statusCode).toBe(200);
    expect(notifications.json().unreadCount).toBe(0);
  });

  it("keeps pinned items ahead of unpinned ones", async () => {
    const body = await listHistory(aliceCookie);
    const pinned = body.items.map((i) => i.pinned);
    const firstUnpinned = pinned.indexOf(false);
    const lastPinned = pinned.lastIndexOf(true);
    if (firstUnpinned !== -1 && lastPinned !== -1) {
      expect(lastPinned).toBeLessThan(firstUnpinned);
    }
  });

  it("shares private message images with both conversation participants", async () => {
    const messages = new DirectMessageService(db);
    const conversationId = await messages.getOrCreateConversation(
      aliceId,
      bobId,
    );
    const form = new FormData();
    form.set(
      "file",
      new File(
        [Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB", "base64")],
        "map.png",
        { type: "image/png" },
      ),
    );
    const encoded = new Response(form);
    const uploaded = await app.inject({
      method: "POST",
      url: `/api/messages/conversations/${conversationId}/images`,
      cookies: { mycharacter_session: aliceCookie },
      headers: { "content-type": encoded.headers.get("content-type")! },
      payload: Buffer.from(await encoded.arrayBuffer()),
    });
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    const imageUrl = uploaded.json().file.url as string;

    const senderImage = await app.inject({
      method: "GET",
      url: imageUrl,
      cookies: { mycharacter_session: aliceCookie },
    });
    expect(senderImage.statusCode).toBe(200);
    expect(senderImage.headers["content-type"]).toBe("image/png");

    const recipientImage = await app.inject({
      method: "GET",
      url: imageUrl,
      cookies: { mycharacter_session: bobCookie },
    });
    expect(recipientImage.statusCode).toBe(200);

    expect(
      (await app.inject({ method: "GET", url: imageUrl })).statusCode,
    ).toBe(401);
  });

  it("accepts message images larger than Fastify's default body limit", async () => {
    const messages = new DirectMessageService(db);
    const conversationId = await messages.getOrCreateConversation(
      aliceId,
      bobId,
    );
    const imageBytes = Buffer.alloc(1024 * 1024 + 64);
    Buffer.from("89504e470d0a1a0a", "hex").copy(imageBytes);
    const form = new FormData();
    form.set(
      "file",
      new File([imageBytes], "large-map.png", { type: "image/png" }),
    );
    const encoded = new Response(form);
    const uploaded = await app.inject({
      method: "POST",
      url: `/api/messages/conversations/${conversationId}/images`,
      cookies: { mycharacter_session: aliceCookie },
      headers: { "content-type": encoded.headers.get("content-type")! },
      payload: Buffer.from(await encoded.arrayBuffer()),
    });

    expect(uploaded.statusCode, uploaded.body).toBe(201);
    expect(uploaded.json().file.url).toMatch(/^\/api\/message-images\//);
  });

  it("rejects unauthenticated access", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/workspace/history",
    });
    expect(response.statusCode).toBe(401);
  });
});
