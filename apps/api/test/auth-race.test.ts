import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, destroyTestDatabase, type Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { verifyPassword } from "../src/modules/auth/password.js";
import { findActiveSession } from "../src/modules/auth/session-repository.js";
import { AuthService } from "../src/modules/auth/service.js";

const oldPassword = "correct horse battery staple";
const newPassword = "a new correct horse battery staple";

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolvePromise: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe("authentication session serialization", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db as unknown as Kysely<Database>;
  });

  afterAll(async () => {
    await destroyTestDatabase(testDb);
  });

  it("revokes a concurrent old-password login session after a successful password change", async () => {
    const bootstrap = new AuthService(db);
    const registered = await bootstrap.register("race@example.com", oldPassword);
    const loginLocked = deferred();
    const releaseLogin = deferred();
    const service = new AuthService(db, {
      onUserLocked: async (operation) => {
        if (operation === "login") {
          loginLocked.resolve();
          await releaseLogin.promise;
        }
      },
    });

    const login = service.login("race@example.com", oldPassword);
    await loginLocked.promise;
    const passwordChange = service.changePassword(
      registered.id,
      registered.session.sessionId,
      oldPassword,
      newPassword,
    );
    releaseLogin.resolve();

    const [oldPasswordLogin, replacementSession] = await Promise.all([login, passwordChange]);
    const staleSession = await findActiveSession(db, oldPasswordLogin.session.token);
    const currentSession = await findActiveSession(db, replacementSession.token);

    expect(staleSession).toBeNull();
    expect(currentSession).toMatchObject({ userId: registered.id });
    await expect(bootstrap.login("race@example.com", oldPassword)).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
    });
  }, 1_000);

  it("performs one password verification for active-wrong, missing, and disabled logins", async () => {
    const bootstrap = new AuthService(db);
    await bootstrap.register("verifier-active@example.com", oldPassword);
    const disabled = await bootstrap.register("verifier-disabled@example.com", oldPassword);
    await db
      .updateTable("users")
      .set({ status: "disabled" })
      .where("id", "=", disabled.id)
      .execute();

    let verifyCalls = 0;
    const service = new AuthService(db, {
      passwordVerifier: {
        verify: async (hash, candidate) => {
          verifyCalls += 1;
          return verifyPassword(hash, candidate);
        },
      },
    });
    const attempts = [
      { email: "verifier-active@example.com", password: "a wrong correct horse battery staple" },
      { email: "verifier-missing@example.com", password: oldPassword },
      { email: "verifier-disabled@example.com", password: oldPassword },
    ];

    for (const attempt of attempts) {
      verifyCalls = 0;
      await expect(service.login(attempt.email, attempt.password)).rejects.toMatchObject({
        code: "AUTH_INVALID_CREDENTIALS",
      });
      expect(verifyCalls).toBe(1);
    }
  });
});
