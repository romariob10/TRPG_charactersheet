import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import { adminOverviewResponseSchema } from "@mycharacter/contracts";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthService } from "../src/modules/auth/service.js";

const password = "correct horse battery staple";

describe("admin overview", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let storageRoot: string;
  let adminCookie: string;
  let userCookie: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), "mycharacter-admin-overview-"));
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storageRoot,
    });
    const auth = new AuthService(testDb.db as unknown as Kysely<Database>);
    await auth.createAdmin("admin-overview@example.com", password);
    await auth.register("user-overview@example.com", password);
    adminCookie = (await auth.login("admin-overview@example.com", password))
      .session.token;
    userCookie = (await auth.login("user-overview@example.com", password))
      .session.token;
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("rejects users without moderation rights", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/overview",
      cookies: { mycharacter_session: userCookie },
    });
    expect(response.statusCode).toBe(403);
  });

  // The web console renders this payload in a Server Component, so a field
  // named differently than the contract crashes the whole page instead of
  // degrading. Validating against the schema keeps both sides aligned.
  it("returns a payload that satisfies the published contract", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/overview",
      cookies: { mycharacter_session: adminCookie },
    });
    expect(response.statusCode).toBe(200);

    const parsed = adminOverviewResponseSchema.safeParse(response.json());
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);

    const body = response.json();
    expect(Array.isArray(body.recentAudit)).toBe(true);
    expect(body.users.admins).toBeGreaterThanOrEqual(1);
  });
});
