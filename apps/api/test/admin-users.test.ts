import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import { adminUsersListResponseSchema } from "@mycharacter/contracts";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthService } from "../src/modules/auth/service.js";

const password = "correct horse battery staple";

describe("admin user listing", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let storageRoot: string;
  let adminCookie: string;
  let bannedUserId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), "mycharacter-admin-users-"));
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
      storageRoot,
    });
    const auth = new AuthService(testDb.db as unknown as Kysely<Database>);
    await auth.createAdmin("admin-users@example.com", password);
    bannedUserId = (await auth.register("banned-user@example.com", password)).id;
    await auth.register("plain-user@example.com", password);
    adminCookie = (await auth.login("admin-users@example.com", password))
      .session.token;
  });

  afterAll(async () => {
    await app.close();
    await destroyTestDatabase(testDb);
    await rm(storageRoot, { recursive: true, force: true });
  });

  // users_status_check only allowed 'active' and 'disabled' while the
  // moderation service writes 'banned', so banning used to fail outright.
  it("bans a user and reports the stored status in the listing", async () => {
    const banned = await app.inject({
      method: "POST",
      url: `/api/admin/users/${bannedUserId}/moderate`,
      cookies: { mycharacter_session: adminCookie },
      payload: { action: "ban", reason: "spamming the feed" },
    });
    expect(banned.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/users?limit=50",
      cookies: { mycharacter_session: adminCookie },
    });
    expect(response.statusCode).toBe(200);

    const parsed = adminUsersListResponseSchema.safeParse(response.json());
    expect(parsed.error?.issues ?? []).toEqual([]);

    const byEmail = new Map(
      response.json().users.map((user: { email: string; status: string }) => [
        user.email,
        user.status,
      ]),
    );
    expect(byEmail.get("banned-user@example.com")).toBe("banned");
    expect(byEmail.get("plain-user@example.com")).toBe("active");
  });

  it("restores an active status when the ban is lifted", async () => {
    const unbanned = await app.inject({
      method: "POST",
      url: `/api/admin/users/${bannedUserId}/unban`,
      cookies: { mycharacter_session: adminCookie },
      payload: { reason: "appeal accepted" },
    });
    expect(unbanned.statusCode).toBe(200);

    const status = await testDb.db
      .selectFrom("users")
      .select("status")
      .where("id", "=", bannedUserId)
      .executeTakeFirstOrThrow();
    expect(status.status).toBe("active");
  });
});
