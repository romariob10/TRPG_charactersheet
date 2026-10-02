import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import type { Kysely } from "kysely";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("agent tokens and authoring", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  const origin = "https://app.example.test";
  beforeAll(async () => {
    database = await createTestDatabase();
    app = await buildApp({
      database: database.db as unknown as Kysely<Database>,
      databaseUrl: database.databaseUrl,
      publicOrigin: origin,
    });
  });
  afterAll(async () => {
    await app?.close();
    if (database) await destroyTestDatabase(database);
  });

  async function register() {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: `${randomUUID()}@example.test`,
        password: "test password for agent access",
      },
    });
    expect(response.statusCode).toBe(201);
    return {
      cookie: `mycharacter_session=${response.cookies.find((c) => c.name === "mycharacter_session")!.value}`,
      userId: response.json().user.id as string,
    };
  }

  it("creates, edits and publishes a sheet through a revocable token with owner permissions", async () => {
    const owner = await register();
    const browserHeaders = { cookie: owner.cookie, origin };
    const created = await app.inject({
      method: "POST",
      url: "/api/agent-tokens",
      headers: browserHeaders,
      payload: { name: "Guide" },
    });
    expect(created.statusCode).toBe(201);
    const { token, metadata } = created.json();
    expect(token).toMatch(/^mcp_[A-Za-z0-9_-]{43}$/);
    const stored = await database.db
      .selectFrom("agent_tokens")
      .selectAll()
      .where("id", "=", metadata.id)
      .executeTakeFirstOrThrow();
    expect(stored.token_hash).not.toBe(token);
    expect(stored.token_hash).toHaveLength(64);
    const listing = await app.inject({
      url: "/api/agent-tokens",
      headers: browserHeaders,
    });
    expect(listing.body).not.toContain(token);
    expect(listing.body).not.toContain(stored.token_hash);
    const headers = { authorization: `Bearer ${token}` };
    expect(
      (await app.inject({ url: "/api/agent-tokens", headers })).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/profiles/me",
          headers: { authorization: "Bearer invalid", cookie: owner.cookie },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/agent-tokens",
          headers: { cookie: owner.cookie },
          payload: { name: "CSRF" },
        })
      ).statusCode,
    ).toBe(403);

    const system = await app.inject({
      method: "POST",
      url: "/api/game-systems",
      headers,
      payload: { title: "Agent system" },
    });
    expect(system.statusCode).toBe(201);
    const sheetId = system.json().defaultSheetId;
    const editor = await app.inject({
      url: `/api/sheet-definitions/${sheetId}/editor`,
      headers,
    });
    expect(editor.statusCode).toBe(200);
    const draft = editor.json().draft;
    const input = {
      expectedRevision: draft.revision,
      layouts: draft.layouts,
      fields: [],
    };
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/api/sheet-definitions/${sheetId}/draft`,
          headers,
          payload: input,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/api/sheet-definitions/${sheetId}/draft`,
          headers,
          payload: input,
        })
      ).statusCode,
    ).toBe(409);
    const presence = {
      resourceType: "sheet",
      resourceId: sheetId,
      x: 0.3,
      y: 0.4,
      status: "Editing",
    };
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/agent-presence",
          headers,
          payload: presence,
        })
      ).statusCode,
    ).toBe(204);
    const online = await app.inject({
      url: `/api/agent-presence?resourceType=sheet&resourceId=${sheetId}`,
      headers: browserHeaders,
    });
    expect(online.json().agents).toEqual([
      expect.objectContaining({ name: "Guide", x: 0.3, y: 0.4 }),
    ]);
    const stranger = await register();
    const strangerToken = await app.inject({
      method: "POST",
      url: "/api/agent-tokens",
      headers: { cookie: stranger.cookie, origin },
      payload: { name: "Stranger" },
    });
    const denied = await app.inject({
      url: `/api/sheet-definitions/${sheetId}/editor`,
      headers: { authorization: `Bearer ${strangerToken.json().token}` },
    });
    expect([403, 404]).toContain(denied.statusCode);
    const published = await app.inject({
      method: "POST",
      url: `/api/sheet-definitions/${sheetId}/publish`,
      headers,
      payload: {},
    });
    expect(published.statusCode).toBe(200);
    const character = await app.inject({
      method: "POST",
      url: "/api/characters",
      headers,
      payload: {
        name: "Agent hero",
        sheetVersionId: published.json().versionId,
      },
    });
    expect(character.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          url: `/api/characters/${character.json().id}/sheet-state`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    await app.inject({
      method: "DELETE",
      url: `/api/agent-tokens/${metadata.id}`,
      headers: browserHeaders,
    });
    expect(
      (await app.inject({ url: "/api/profiles/me", headers })).statusCode,
    ).toBe(401);
    const offline = await app.inject({
      url: `/api/agent-presence?resourceType=sheet&resourceId=${sheetId}`,
      headers: browserHeaders,
    });
    expect(offline.json().agents).toEqual([]);
  });

  it("rejects expired tokens and disabled owners", async () => {
    const owner = await register();
    const created = await app.inject({
      method: "POST",
      url: "/api/agent-tokens",
      headers: { cookie: owner.cookie, origin },
      payload: { name: "Expired" },
    });
    const { token, metadata } = created.json();
    const headers = { authorization: `Bearer ${token}` };
    await database.db
      .updateTable("agent_tokens")
      .set({ expires_at: new Date(0) })
      .where("id", "=", metadata.id)
      .execute();
    expect(
      (await app.inject({ url: "/api/profiles/me", headers })).statusCode,
    ).toBe(401);
    await database.db
      .updateTable("agent_tokens")
      .set({ expires_at: new Date(Date.now() + 60_000) })
      .where("id", "=", metadata.id)
      .execute();
    await database.db
      .updateTable("users")
      .set({ status: "disabled" })
      .where("id", "=", owner.userId)
      .execute();
    expect(
      (await app.inject({ url: "/api/profiles/me", headers })).statusCode,
    ).toBe(401);
  });
});
