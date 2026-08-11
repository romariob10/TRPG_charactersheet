import type { AuthUser } from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Kysely, Transaction } from "kysely";
import { AppError } from "../../errors.js";
import { usernameForRegistration } from "../profiles/username.js";
import {
  argon2PasswordVerifier,
  dummyPasswordHash,
  hashPassword,
  type PasswordVerifier,
} from "./password.js";
import {
  createSession,
  revokeOtherSessions,
  revokeSession,
  type CreatedSession,
} from "./session-repository.js";

const USERNAME_CONSTRAINT = "profiles_username_idx";
const USERNAME_ALLOCATION_ATTEMPTS = 3;

export interface AuthenticatedUser extends AuthUser {
  session: CreatedSession;
}

export type AuthOperation = "login" | "change-password";

export interface AuthServiceOptions {
  // eslint-disable-next-line no-unused-vars -- The hook provides a controlled operation barrier for integration tests.
  onUserLocked?: (operation: AuthOperation) => Promise<void>;
  passwordVerifier?: PasswordVerifier;
}

export class AuthService {
  private readonly db: Kysely<Database>;
  private readonly onUserLocked: NonNullable<AuthServiceOptions["onUserLocked"]>;
  private readonly passwordVerifier: PasswordVerifier;

  constructor(db: Kysely<Database>, options: AuthServiceOptions = {}) {
    this.db = db;
    this.onUserLocked = options.onUserLocked ?? (async () => {});
    this.passwordVerifier = options.passwordVerifier ?? argon2PasswordVerifier;
  }

  async register(email: string, password: string): Promise<AuthenticatedUser> {
    const passwordHash = await hashPassword(password);

    for (let attempt = 1; attempt <= USERNAME_ALLOCATION_ATTEMPTS; attempt++) {
      try {
        return await this.db.transaction().execute(async (trx) => {
          const user = await trx
            .insertInto("users")
            .values({ email, password_hash: passwordHash, status: "active" })
            .returning(["id", "email"])
            .executeTakeFirstOrThrow();
          const username = await allocateUsername(
            trx,
            usernameForRegistration(email, user.id),
            user.id,
          );
          await trx
            .insertInto("profiles")
            .values({ id: user.id, username })
            .execute();
          const session = await createSession(trx, user.id);

          return { id: user.id, email: user.email, session };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          if (constraintName(error) === USERNAME_CONSTRAINT) {
            continue;
          }
          throw new AppError(
            "AUTH_EMAIL_ALREADY_REGISTERED",
            409,
            "An account with this email already exists.",
          );
        }
        throw error;
      }
    }
    throw new AppError(
      "USERNAME_ALLOCATION_FAILED",
      500,
      "Could not allocate a unique username.",
    );
  }

  async createAdmin(email: string, password: string): Promise<AuthUser> {
    const passwordHash = await hashPassword(password);
    for (let attempt = 1; attempt <= USERNAME_ALLOCATION_ATTEMPTS; attempt++) {
      try {
        return await this.db.transaction().execute(async (trx) => {
          const user = await trx
            .insertInto("users")
            .values({ email, password_hash: passwordHash, status: "active" })
            .returning(["id", "email"])
            .executeTakeFirstOrThrow();
          const username = await allocateUsername(
            trx,
            usernameForRegistration(email, user.id),
            user.id,
          );
          await trx
            .insertInto("profiles")
            .values({ id: user.id, username, is_admin: true })
            .execute();
          return user;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          if (constraintName(error) === USERNAME_CONSTRAINT) {
            continue;
          }
          throw new AppError(
            "AUTH_EMAIL_ALREADY_REGISTERED",
            409,
            "An account with this email already exists.",
          );
        }
        throw error;
      }
    }
    throw new AppError(
      "USERNAME_ALLOCATION_FAILED",
      500,
      "Could not allocate a unique username.",
    );
  }

  async login(email: string, password: string): Promise<AuthenticatedUser> {
    return this.db.transaction().execute(async (trx) => {
      const user = await trx
        .selectFrom("users")
        .select(["id", "email", "password_hash", "status"])
        .where("email", "=", email)
        .forUpdate()
        .executeTakeFirst();
      await this.onUserLocked("login");
      const passwordIsValid = await this.passwordVerifier.verify(
        user?.status === "active" ? user.password_hash : dummyPasswordHash,
        password,
      );
      if (!user || user.status !== "active" || !passwordIsValid) {
        throw invalidCredentialsError();
      }

      const session = await createSession(trx, user.id);
      return { id: user.id, email: user.email, session };
    });
  }

  async getUser(userId: string): Promise<AuthUser> {
    const user = await this.db
      .selectFrom("users")
      .select(["id", "email"])
      .where("id", "=", userId)
      .where("status", "=", "active")
      .executeTakeFirst();
    if (!user) {
      throw new AppError("AUTH_REQUIRED", 401, "Authentication is required.");
    }
    return user;
  }

  async logout(sessionId: string): Promise<void> {
    await revokeSession(this.db, sessionId);
  }

  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<CreatedSession> {
    const passwordHash = await hashPassword(newPassword);
    return this.db.transaction().execute(async (trx) => {
      const user = await trx
        .selectFrom("users")
        .select(["id", "password_hash", "status"])
        .where("id", "=", userId)
        .forUpdate()
        .executeTakeFirst();
      await this.onUserLocked("change-password");
      if (
        !user ||
        user.status !== "active" ||
        !(await this.passwordVerifier.verify(user.password_hash, currentPassword))
      ) {
        throw invalidCredentialsError();
      }

      const updated = await trx
        .updateTable("users")
        .set({ password_hash: passwordHash })
        .where("id", "=", user.id)
        .where("password_hash", "=", user.password_hash)
        .where("status", "=", "active")
        .returning("id")
        .executeTakeFirst();
      if (!updated) {
        throw invalidCredentialsError();
      }

      await revokeOtherSessions(trx, user.id, sessionId);
      await revokeSession(trx, sessionId);
      return createSession(trx, user.id);
    });
  }
}

async function allocateUsername(
  trx: Kysely<Database> | Transaction<Database>,
  base: string,
  userId: string,
): Promise<string> {
  const taken = new Set(
    (
      await trx
        .selectFrom("profiles")
        .select("username")
        .where((eb) =>
          eb.or([
            eb("username", "=", base),
            eb("username", "like", `${base}-%`),
          ]),
        )
        .execute()
    ).map((row) => row.username),
  );
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix <= 50; suffix++) {
    const suffixText = `-${suffix}`;
    const candidate = `${base.slice(0, 30 - suffixText.length)}${suffixText}`;
    if (!taken.has(candidate)) return candidate;
  }
  const fallback = `user-${userId.replaceAll("-", "").slice(0, 8)}`;
  if (!taken.has(fallback)) return fallback;
  return `${fallback.slice(0, 27)}-${Date.now() % 1000}`;
}

function invalidCredentialsError(): AppError {
  return new AppError("AUTH_INVALID_CREDENTIALS", 401, "Invalid email or password.");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function constraintName(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "constraint" in error
    ? String((error as { constraint?: unknown }).constraint ?? "")
    : undefined;
}
