import { createHash, randomBytes } from "node:crypto";
import type { Database } from "@mycharacter/database";
import type { Kysely, Transaction } from "kysely";

import type { SiteRole } from "@mycharacter/contracts";

const sessionLifetimeMilliseconds = 30 * 24 * 60 * 60 * 1000;
const lastUsedUpdateIntervalMilliseconds = 5 * 60 * 1000;

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

export interface ActorSession {
  sessionId: string;
  userId: string;
  role: SiteRole;
  isAdmin: boolean;
  username?: string;
  displayName?: string | null;
  lastUsedAt: Date;
}

export interface CreatedSession {
  sessionId: string;
  token: string;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  db: DatabaseExecutor,
  userId: string,
): Promise<CreatedSession> {
  const token = createSessionToken();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + sessionLifetimeMilliseconds);
  const session = await db
    .insertInto("sessions")
    .values({
      user_id: userId,
      token_hash: hashSessionToken(token),
      expires_at: expiresAt,
      last_used_at: createdAt,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return { sessionId: session.id, token };
}

export async function findActiveSession(
  db: DatabaseExecutor,
  token: string,
): Promise<ActorSession | null> {
  const session = await db
    .selectFrom("sessions")
    .innerJoin("users", "users.id", "sessions.user_id")
    .leftJoin("profiles", "profiles.id", "sessions.user_id")
    .select([
      "sessions.id as sessionId",
      "sessions.user_id as userId",
      "profiles.username as username",
      "profiles.display_name as displayName",
      "profiles.site_role as siteRole",
      "profiles.is_admin as isAdmin",
      "sessions.last_used_at as lastUsedAt",
    ])
    .where("sessions.token_hash", "=", hashSessionToken(token))
    .where("sessions.revoked_at", "is", null)
    .where("sessions.expires_at", ">", new Date())
    .where("users.status", "=", "active")
    .executeTakeFirst();

  if (!session) return null;

  return {
    sessionId: session.sessionId,
    userId: session.userId,
    username: session.username ?? undefined,
    displayName: session.displayName ?? null,
    role: session.isAdmin
      ? "admin"
      : ((session.siteRole as SiteRole | null) ?? "user"),
    isAdmin: Boolean(session.isAdmin || session.siteRole === "admin"),
    lastUsedAt: session.lastUsedAt,
  };
}

export async function touchSessionIfStale(
  db: DatabaseExecutor,
  session: ActorSession,
): Promise<void> {
  const staleBefore = new Date(Date.now() - lastUsedUpdateIntervalMilliseconds);
  if (session.lastUsedAt >= staleBefore) {
    return;
  }

  await db
    .updateTable("sessions")
    .set({ last_used_at: new Date() })
    .where("id", "=", session.sessionId)
    .where("last_used_at", "<", staleBefore)
    .execute();
}

export async function revokeSession(
  db: DatabaseExecutor,
  sessionId: string,
): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ revoked_at: new Date() })
    .where("id", "=", sessionId)
    .where("revoked_at", "is", null)
    .execute();
}

export async function revokeOtherSessions(
  db: DatabaseExecutor,
  userId: string,
  sessionId: string,
): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ revoked_at: new Date() })
    .where("user_id", "=", userId)
    .where("id", "!=", sessionId)
    .where("revoked_at", "is", null)
    .execute();
}
