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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthService } from "../src/modules/auth/service.js";

const password = "correct horse battery staple";

describe("direct message roll command", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let storageRoot: string;
  let senderCookie: string;
  let recipientCookie: string;
  let recipientUsername: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), "mycharacter-message-roll-"));
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storageRoot,
    });

    const auth = new AuthService(testDb.db as unknown as Kysely<Database>);
    const sender = await auth.register("roll-sender@example.com", password);
    const recipient = await auth.register("roll-recipient@example.com", password);
    senderCookie = sender.session.token;
    recipientCookie = recipient.session.token;
    recipientUsername = (
      await testDb.db
        .selectFrom("profiles")
        .select("username")
        .where("id", "=", recipient.id)
        .executeTakeFirstOrThrow()
    ).username;
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("stores one server-generated result visible to both participants", async () => {
    const conversation = await app.inject({
      method: "POST",
      url: "/api/messages/conversations",
      cookies: { mycharacter_session: senderCookie },
      payload: { recipientUsername },
    });
    expect(conversation.statusCode).toBe(201);
    const conversationId = conversation.json().conversationId as string;

    const sent = await app.inject({
      method: "POST",
      url: `/api/messages/conversations/${conversationId}`,
      cookies: { mycharacter_session: senderCookie },
      payload: { body: "/roll 6" },
    });
    expect(sent.statusCode).toBe(201);
    const match = /^🎲 \/roll 6 → ([1-6])$/.exec(sent.json().body as string);
    expect(match).not.toBeNull();

    const received = await app.inject({
      method: "GET",
      url: `/api/messages/conversations/${conversationId}`,
      cookies: { mycharacter_session: recipientCookie },
    });
    expect(received.statusCode).toBe(200);
    expect(received.json().messages).toEqual([
      expect.objectContaining({ body: sent.json().body }),
    ]);
  });
});
