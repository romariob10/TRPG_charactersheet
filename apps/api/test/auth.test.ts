import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDatabase, destroyTestDatabase, type Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { buildApp } from "../src/app.js";
import { AuthService } from "../src/modules/auth/service.js";

const password = "correct horse battery staple";

function getSessionCookie(response: Awaited<ReturnType<FastifyInstance["inject"]>>) {
  const cookie = response.cookies.find((item) => item.name === "mycharacter_session");
  expect(cookie).toBeDefined();
  return cookie!;
}

describe("local authentication", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  beforeEach(async () => {
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      cookieSecure: false,
      allowMissingOriginForTests: true,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await destroyTestDatabase(testDb);
  });

  it("creates an administrator without creating a browser session", async () => {
    const admin = await new AuthService(
      testDb.db as unknown as Kysely<Database>,
    ).createAdmin("admin@example.com", password);
    const profile = await testDb.db
      .selectFrom("profiles")
      .select("is_admin")
      .where("id", "=", admin.id)
      .executeTakeFirstOrThrow();
    const sessions = await testDb.db
      .selectFrom("sessions")
      .select("id")
      .where("user_id", "=", admin.id)
      .execute();

    expect(profile.is_admin).toBe(true);
    expect(sessions).toEqual([]);
  });

  it("registers an active user and sets an opaque session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "hero@example.com", password },
    });

    expect(response.statusCode).toBe(201);
    const cookie = getSessionCookie(response);
    expect(Buffer.from(cookie.value, "base64url")).toHaveLength(32);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(response.json()).toMatchObject({ user: { email: "hero@example.com" } });

    const user = await testDb.db
      .selectFrom("users")
      .select(["status", "email"])
      .where("email", "=", "hero@example.com")
      .executeTakeFirstOrThrow();
    const profile = await testDb.db
      .selectFrom("profiles")
      .select("id")
      .where("id", "=", response.json().user.id)
      .executeTakeFirstOrThrow();

    expect(user).toEqual({ status: "active", email: "hero@example.com" });
    expect(profile.id).toBe(response.json().user.id);
  });

  it("normalizes email addresses before persisting them", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "  HERO.NORMALIZED@EXAMPLE.COM  ", password },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().user.email).toBe("hero.normalized@example.com");
  });

  it("does not store the raw session token", async () => {
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "opaque@example.com", password },
    });
    const cookie = getSessionCookie(registration);
    const row = await testDb.db
      .selectFrom("sessions")
      .select("token_hash")
      .where("user_id", "=", registration.json().user.id)
      .executeTakeFirstOrThrow();

    expect(row.token_hash).not.toContain(cookie.value);
    expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses a generic response for invalid login credentials", async () => {
    const missingUser = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "missing@example.com", password },
    });
    const wrongPassword = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "login@example.com", password },
    });
    const invalidPassword = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "login@example.com", password: "a different invalid password" },
    });

    expect(missingUser.statusCode).toBe(401);
    expect(invalidPassword.statusCode).toBe(401);
    expect(missingUser.json().error).toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Invalid email or password.",
    });
    expect(invalidPassword.json().error).toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Invalid email or password.",
    });
    expect(getSessionCookie(wrongPassword)).toBeDefined();
  });

  it("loads an authenticated session from the opaque cookie", async () => {
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "session@example.com", password },
    });
    const cookie = getSessionCookie(registration);
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { [cookie.name]: cookie.value },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ user: { email: "session@example.com" } });
  });

  it("throttles session last-used writes to once per five minutes", async () => {
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "last-used@example.com", password },
    });
    const cookie = getSessionCookie(registration);
    const original = await testDb.db
      .selectFrom("sessions")
      .select(["id", "last_used_at"])
      .where("user_id", "=", registration.json().user.id)
      .executeTakeFirstOrThrow();

    await app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { [cookie.name]: cookie.value },
    });
    const untouched = await testDb.db
      .selectFrom("sessions")
      .select("last_used_at")
      .where("id", "=", original.id)
      .executeTakeFirstOrThrow();

    expect(untouched.last_used_at.getTime()).toBe(original.last_used_at.getTime());

    const staleAt = new Date(Date.now() - 6 * 60 * 1000);
    await testDb.db
      .updateTable("sessions")
      .set({ last_used_at: staleAt })
      .where("id", "=", original.id)
      .execute();
    await app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { [cookie.name]: cookie.value },
    });
    const touched = await testDb.db
      .selectFrom("sessions")
      .select("last_used_at")
      .where("id", "=", original.id)
      .executeTakeFirstOrThrow();

    expect(touched.last_used_at.getTime()).toBeGreaterThan(staleAt.getTime());
  });

  it("revokes the old session on logout", async () => {
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "logout@example.com", password },
    });
    const cookie = getSessionCookie(registration);
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { [cookie.name]: cookie.value },
    });
    const session = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { [cookie.name]: cookie.value },
    });

    expect(logout.statusCode).toBe(204);
    expect(session.statusCode).toBe(401);
    expect(session.json().error.code).toBe("AUTH_REQUIRED");
  });

  it("changes the password, revokes other sessions, and rotates the current session", async () => {
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "rotate@example.com", password },
    });
    const currentCookie = getSessionCookie(registration);
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "rotate@example.com", password },
    });
    const otherCookie = getSessionCookie(login);
    const changed = await app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      cookies: { [currentCookie.name]: currentCookie.value },
      payload: { currentPassword: password, newPassword: "a new correct horse battery staple" },
    });
    const rotatedCookie = getSessionCookie(changed);
    const currentSession = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { [rotatedCookie.name]: rotatedCookie.value },
    });
    const otherSession = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { [otherCookie.name]: otherCookie.value },
    });
    const oldCurrentSession = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      cookies: { [currentCookie.name]: currentCookie.value },
    });

    expect(changed.statusCode).toBe(200);
    expect(rotatedCookie.value).not.toBe(currentCookie.value);
    expect(currentSession.statusCode).toBe(200);
    expect(otherSession.statusCode).toBe(401);
    expect(oldCurrentSession.statusCode).toBe(401);
  });

  it("keeps password reset behind the email adapter", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      payload: { email: "hero@example.com" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("EMAIL_DELIVERY_NOT_CONFIGURED");
  });

  it("rate limits registration and login independently", async () => {
    const registerResponses = [];
    const loginResponses = [];
    for (let index = 0; index < 6; index += 1) {
      registerResponses.push(await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: `limited-${index}@example.com`, password },
      }));
    }
    for (let index = 0; index < 6; index += 1) {
      loginResponses.push(await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "not-registered@example.com", password },
      }));
    }

    expect(registerResponses.filter((response) => response.statusCode === 429)).toHaveLength(1);
    expect(loginResponses.filter((response) => response.statusCode === 429)).toHaveLength(1);
    expect(registerResponses.find((response) => response.statusCode === 429)?.json().error.code).toBe(
      "RATE_LIMITED",
    );
  });

  it("rate limits the one-hop forwarded client without trusting a spoofed XFF chain", async () => {
    const exhaustedClient = "198.51.100.10";
    for (let index = 0; index < 5; index += 1) {
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-forwarded-for": exhaustedClient },
        payload: { email: `forwarded-${index}@example.com`, password },
      });
    }

    const exhausted = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-forwarded-for": exhaustedClient },
      payload: { email: "forwarded-exhausted@example.com", password },
    });
    const independentClient = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-forwarded-for": "198.51.100.20" },
      payload: { email: "forwarded-independent@example.com", password },
    });
    const spoofedChain = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-forwarded-for": `203.0.113.200, ${exhaustedClient}` },
      payload: { email: "forwarded-spoofed@example.com", password },
    });

    expect(exhausted.statusCode).toBe(429);
    expect(independentClient.statusCode).toBe(201);
    expect(spoofedChain.statusCode).toBe(429);
  });

  it("enforces the configured origins for live cookie-authenticated mutations", async () => {
    await app.close();
    app = await buildApp({
      database: testDb.db as unknown as Kysely<Database>,
      databaseUrl: testDb.databaseUrl,
      publicOrigin: "https://app.example.test",
      allowedOrigins: ["https://alias.example.test"],
      cookieSecure: false,
      allowMissingOriginForTests: false,
    });
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "origin@example.com", password },
    });
    const cookie = getSessionCookie(registration);
    const absentOrigin = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { [cookie.name]: cookie.value },
    });
    const mismatchedOrigin = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { origin: "https://attacker.example.test" },
      cookies: { [cookie.name]: cookie.value },
    });
    const matchingOrigin = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { origin: "https://alias.example.test" },
      cookies: { [cookie.name]: cookie.value },
    });

    expect(absentOrigin.statusCode).toBe(403);
    expect(absentOrigin.json().error.code).toBe("ORIGIN_FORBIDDEN");
    expect(mismatchedOrigin.statusCode).toBe(403);
    expect(mismatchedOrigin.json().error.code).toBe("ORIGIN_FORBIDDEN");
    expect(matchingOrigin.statusCode).toBe(204);
  });
});
