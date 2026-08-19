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

describe("admin AI settings", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let storageRoot: string;
  let adminCookie: string;
  let userCookie: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), "mycharacter-admin-ai-"));
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storageRoot,
    });
    const auth = new AuthService(testDb.db as unknown as Kysely<Database>);
    await auth.createAdmin("admin-ai@example.com", password);
    await auth.register("user-ai@example.com", password);
    adminCookie = (await auth.login("admin-ai@example.com", password)).session
      .token;
    userCookie = (await auth.login("user-ai@example.com", password)).session
      .token;
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("rejects non-admin users", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/ai-settings",
      cookies: { mycharacter_session: userCookie },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("ADMIN_REQUIRED");
  });

  it("saves a provider without ever returning its API key", async () => {
    const saved = await app.inject({
      method: "PUT",
      url: "/api/admin/ai-settings",
      cookies: { mycharacter_session: adminCookie },
      payload: {
        provider: "openrouter",
        apiKey: "openrouter-secret-key",
        baseUrl: "https://openrouter.ai/api/v1",
        chatModel: "vendor/chat-model",
        visionModel: "vendor/vision-model",
        visionSupportsImages: true,
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      provider: "openrouter",
      configured: true,
      keyHint: "••••••••-key",
      source: "admin",
    });
    expect(saved.body).not.toContain("openrouter-secret-key");

    const loaded = await app.inject({
      method: "GET",
      url: "/api/admin/ai-settings",
      cookies: { mycharacter_session: adminCookie },
    });
    expect(loaded.json()).toEqual(saved.json());
  });

  it("requires a new key when the provider changes", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/admin/ai-settings",
      cookies: { mycharacter_session: adminCookie },
      payload: {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        chatModel: "chat-model",
        visionModel: "vision-model",
        visionSupportsImages: true,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("AI_API_KEY_REQUIRED");
  });
});
