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

type TestSocket = Awaited<ReturnType<FastifyInstance["injectWS"]>>;

describe("local realtime", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let owner: Identity;
  let editor: Identity;
  let stranger: Identity;
  let templateId: string;
  let fieldId: string;
  let characterId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
    });
    await app.ready();
    owner = await register("owner.realtime@example.com");
    editor = await register("editor.realtime@example.com");
    stranger = await register("stranger.realtime@example.com");
  });

  beforeEach(async () => {
    await testDb.db.deleteFrom("character_mutations").execute();
    await testDb.db.deleteFrom("character_values").execute();
    await testDb.db.deleteFrom("character_members").execute();
    await testDb.db.deleteFrom("characters").execute();
    await testDb.db.deleteFrom("pdf_fields").execute();
    await testDb.db.deleteFrom("pdf_templates").execute();
    await testDb.db.deleteFrom("object_files").execute();

    const object = await testDb.db
      .insertInto("object_files")
      .values({
        storage_key: `realtime/${crypto.randomUUID()}.pdf`,
        sha256: "a".repeat(64),
        size_bytes: "100",
        media_type: "application/pdf",
        state: "ready",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    templateId = (
      await testDb.db
        .insertInto("pdf_templates")
        .values({
          owner_id: owner.userId,
          file_id: object.id,
          title: "Realtime",
          slug: "realtime",
          visibility: "private",
          storage_path: `realtime/${crypto.randomUUID()}.pdf`,
          sha256: "b".repeat(64),
          page_count: 1,
          catalog_status: "ready",
          catalog_approved_at: new Date(),
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    fieldId = (
      await testDb.db
        .insertInto("pdf_fields")
        .values({
          template_id: templateId,
          pdf_name: "name",
          kind: "text",
          page: 1,
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    characterId = (
      await testDb.db
        .insertInto("characters")
        .values({
          template_id: templateId,
          owner_id: owner.userId,
          name: "Ada",
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
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

  it("rejects an unauthorized character subscription", async () => {
    const client = await connect(stranger);
    client.send(subscribe());
    await expect(client.next()).resolves.toMatchObject({
      type: "error",
      code: "REALTIME_SUBSCRIPTION_FORBIDDEN",
    });
    client.close();
  });

  it("broadcasts only the committed authoritative field snapshot", async () => {
    const client = await connect(editor);
    client.send(subscribe());
    await expect(client.next()).resolves.toMatchObject({ type: "subscribed" });
    await expect(client.next()).resolves.toMatchObject({ type: "presence.snapshot" });

    const event = client.next();
    const response = await app.inject({
      method: "PUT",
      url: `/api/characters/${characterId}/fields/${fieldId}`,
      cookies: { mycharacter_session: owner.cookie },
      payload: {
        value: "Ada Lovelace",
        expectedVersion: 0,
        clientMutationId: crypto.randomUUID(),
      },
    });
    expect(response.statusCode).toBe(200);
    await expect(event).resolves.toMatchObject({
      type: "field.changed",
      characterId,
      fieldId,
      value: "Ada Lovelace",
      version: 1,
      revision: 1,
      updatedBy: owner.userId,
    });
    client.close();
  });

  it.each([
    {
      fixture: "invalid message",
      message: "{",
      code: "REALTIME_MESSAGE_INVALID",
    },
    {
      fixture: "oversized message",
      message: "x".repeat(65_537),
      code: "REALTIME_MESSAGE_TOO_LARGE",
    },
  ])("$fixture emits $code", async ({ message, code }) => {
    const client = await connect(owner);
    client.socket.send(message);
    await expect(client.next()).resolves.toMatchObject({ type: "error", code });
    client.close();
  });

  it("reports presence joins and leaves", async () => {
    const first = await connect(owner);
    first.send(subscribe());
    await first.next();
    await expect(first.next()).resolves.toMatchObject({
      type: "presence.snapshot",
      members: [{ userId: owner.userId }],
    });

    const second = await connect(editor);
    second.send(subscribe());
    await second.next();
    await second.next();
    await expect(first.next()).resolves.toMatchObject({
      type: "presence.joined",
      member: { userId: editor.userId },
    });
    second.send({
      protocolVersion: 1,
      type: "unsubscribe",
      characterId,
    });
    await expect(first.next()).resolves.toMatchObject({ type: "presence.left" });
    second.close();
    first.close();
  });

  it("returns ordered catch-up changes and falls back to a snapshot on a gap", async () => {
    for (const [value, expectedVersion] of [["Ada", 0], ["Grace", 1]] as const) {
      const response = await app.inject({
        method: "PUT",
        url: `/api/characters/${characterId}/fields/${fieldId}`,
        cookies: { mycharacter_session: owner.cookie },
        payload: { value, expectedVersion, clientMutationId: crypto.randomUUID() },
      });
      expect(response.statusCode).toBe(200);
    }
    const changes = await app.inject({
      method: "GET",
      url: `/api/characters/${characterId}/changes?afterRevision=0`,
      cookies: { mycharacter_session: editor.cookie },
    });
    expect(changes.statusCode).toBe(200);
    expect(changes.json()).toMatchObject({
      mode: "changes",
      revision: 2,
      changes: [{ revision: 1, value: "Ada" }, { revision: 2, value: "Grace" }],
    });

    await testDb.db
      .deleteFrom("character_mutations")
      .where("character_id", "=", characterId)
      .execute();
    await testDb.db
      .updateTable("characters")
      .set({ revision: "20" })
      .where("id", "=", characterId)
      .execute();
    const snapshot = await app.inject({
      method: "GET",
      url: `/api/characters/${characterId}/changes?afterRevision=1`,
      cookies: { mycharacter_session: owner.cookie },
    });
    expect(snapshot.json()).toMatchObject({
      mode: "snapshot",
      character: { id: characterId, revision: 20 },
    });
  });

  function subscribe() {
    return {
      protocolVersion: 1,
      type: "subscribe",
      characterId,
      afterRevision: 0,
    };
  }

  async function connect(identity: Identity) {
    const socket = await app.injectWS("/api/realtime", {
      headers: { cookie: `mycharacter_session=${identity.cookie}` },
    });
    return messageClient(socket);
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

function messageClient(socket: TestSocket) {
  const messages: unknown[] = [];
  // eslint-disable-next-line no-unused-vars -- Callback parameter documents the queued value.
  const waiters: Array<(message: unknown) => void> = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else messages.push(message);
  });
  return {
    socket,
    send(message: object) {
      socket.send(JSON.stringify(message));
    },
    next(): Promise<unknown> {
      const message = messages.shift();
      if (message !== undefined) return Promise.resolve(message);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Timed out waiting for realtime message.")),
          2_000,
        );
        waiters.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      });
    },
    close() {
      socket.close();
    },
  };
}
