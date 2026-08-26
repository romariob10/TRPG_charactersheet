import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import { gameSystemSummarySchema } from "@mycharacter/contracts";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthService } from "../src/modules/auth/service.js";

const password = "correct horse battery staple";

describe("official game systems", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let storageRoot: string;
  let adminCookie: string;
  let userCookie: string;
  let systemId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), "mycharacter-official-systems-"));
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storageRoot,
    });
    const auth = new AuthService(testDb.db as unknown as Kysely<Database>);
    await auth.createAdmin("official-admin@example.com", password);
    await auth.register("system-owner@example.com", password);
    adminCookie = (await auth.login("official-admin@example.com", password)).session.token;
    userCookie = (await auth.login("system-owner@example.com", password)).session.token;

    const created = await app.inject({
      method: "POST",
      url: "/api/game-systems",
      cookies: { mycharacter_session: userCookie },
      payload: { title: "Verified Rules", visibility: "private" },
    });
    expect(created.statusCode).toBe(201);
    systemId = created.json().id as string;
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("allows only admins to mark a system official and publishes it", async () => {
    const adminList = await app.inject({
      method: "GET",
      url: "/api/admin/game-systems",
      cookies: { mycharacter_session: adminCookie },
    });
    expect(adminList.statusCode).toBe(200);
    expect(adminList.json()).toEqual([
      expect.objectContaining({
        id: systemId,
        isOfficial: false,
        visibility: "private",
      }),
    ]);

    const denied = await app.inject({
      method: "PATCH",
      url: `/api/admin/game-systems/${systemId}/official`,
      cookies: { mycharacter_session: userCookie },
      payload: { isOfficial: true },
    });
    expect(denied.statusCode).toBe(403);

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/admin/game-systems/${systemId}/official`,
      cookies: { mycharacter_session: adminCookie },
      payload: { isOfficial: true },
    });
    expect(updated.statusCode).toBe(200);
    const parsed = gameSystemSummarySchema.parse(updated.json());
    expect(parsed).toMatchObject({
      id: systemId,
      isOfficial: true,
      visibility: "public",
    });
  });

  it("returns official systems in their dedicated scope", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/game-systems?scope=official",
      cookies: { mycharacter_session: userCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({ id: systemId, isOfficial: true }),
    ]);
  });

  it("prevents an owner from making an official system private", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/game-systems/${systemId}`,
      cookies: { mycharacter_session: userCookie },
      payload: { visibility: "private" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("OFFICIAL_SYSTEM_MUST_BE_PUBLIC");
  });
});
