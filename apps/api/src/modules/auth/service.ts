import type { AuthUser } from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { AppError } from "../../errors.js";
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

    try {
      return await this.db.transaction().execute(async (trx) => {
        const user = await trx
          .insertInto("users")
          .values({ email, password_hash: passwordHash, status: "active" })
          .returning(["id", "email"])
          .executeTakeFirstOrThrow();
        await trx
          .insertInto("profiles")
          .values({ id: user.id })
          .execute();
        const session = await createSession(trx, user.id);

        return { id: user.id, email: user.email, session };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          "AUTH_EMAIL_ALREADY_REGISTERED",
          409,
          "An account with this email already exists.",
        );
      }
      throw error;
    }
  }

  async createAdmin(email: string, password: string): Promise<AuthUser> {
    const passwordHash = await hashPassword(password);
    try {
      return await this.db.transaction().execute(async (trx) => {
        const user = await trx
          .insertInto("users")
          .values({ email, password_hash: passwordHash, status: "active" })
          .returning(["id", "email"])
          .executeTakeFirstOrThrow();
        await trx
          .insertInto("profiles")
          .values({ id: user.id, is_admin: true })
          .execute();
        return user;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          "AUTH_EMAIL_ALREADY_REGISTERED",
          409,
          "An account with this email already exists.",
        );
      }
      throw error;
    }
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

function invalidCredentialsError(): AppError {
  return new AppError("AUTH_INVALID_CREDENTIALS", 401, "Invalid email or password.");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
