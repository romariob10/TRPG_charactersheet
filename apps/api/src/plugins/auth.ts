import type { Database } from "@mycharacter/database";
import "fastify";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import { AppError } from "../errors.js";
import { findActiveSession, touchSessionIfStale } from "../modules/auth/session-repository.js";

import type { Permission, SiteRole } from "@mycharacter/contracts";
import { hasPermission } from "@mycharacter/contracts";

export const sessionCookieName = "mycharacter_session";
export const sessionCookieMaxAge = 60 * 60 * 24 * 30;

export interface Actor {
  userId: string;
  sessionId: string;
  role: SiteRole;
  isAdmin: boolean;
  username?: string;
  displayName?: string | null;
}

export interface AuthPluginOptions {
  allowedOrigins: readonly string[];
  database?: Kysely<Database>;
  allowMissingOriginForTests?: boolean;
}

declare module "fastify" {
  // eslint-disable-next-line no-unused-vars -- TypeScript merges this interface into FastifyRequest.
  interface FastifyRequest {
    actor: Actor | null;
  }
}

export async function registerAuth(
  app: FastifyInstance,
  options: AuthPluginOptions,
): Promise<void> {
  const db = options.database ?? app.db;
  const allowedOrigins = new Set(options.allowedOrigins);
  app.decorateRequest("actor", null);

  app.addHook("onRequest", async (request) => {
    const token = request.cookies[sessionCookieName];
    if (!token) {
      return;
    }

    const session = await findActiveSession(db, token);
    if (!session) {
      return;
    }

    request.actor = {
      userId: session.userId,
      sessionId: session.sessionId,
      role: session.role,
      isAdmin: session.isAdmin,
      username: session.username,
      displayName: session.displayName,
    };
    assertCookieMutationOrigin(request, options, allowedOrigins);
    await touchSessionIfStale(db, session);
  });
}

export function requireActor(request: FastifyRequest): Actor {
  if (!request.actor) {
    throw new AppError("AUTH_REQUIRED", 401, "Authentication is required.");
  }
  return request.actor;
}

export function requireRole(
  request: FastifyRequest,
  ...allowedRoles: SiteRole[]
): Actor {
  const actor = requireActor(request);
  if (!allowedRoles.includes(actor.role)) {
    throw new AppError(
      "FORBIDDEN",
      403,
      "Insufficient permissions for this action.",
    );
  }
  return actor;
}

export function requirePermission(
  request: FastifyRequest,
  permission: Permission,
): Actor {
  const actor = requireActor(request);
  if (!hasPermission(actor.role, permission)) {
    throw new AppError("FORBIDDEN", 403, `Permission denied: ${permission}`);
  }
  return actor;
}

export function can(actor: Actor | null, permission: Permission): boolean {
  if (!actor) return false;
  return hasPermission(actor.role, permission);
}

export async function requireAdmin(
  request: FastifyRequest,
  _database?: Kysely<Database>,
): Promise<Actor> {
  void _database;
  const actor = requireActor(request);
  if (actor.role !== "admin") {
    throw new AppError(
      "ADMIN_REQUIRED",
      403,
      "Administrator access is required.",
    );
  }
  return actor;
}

export async function requireModerator(
  request: FastifyRequest,
): Promise<Actor> {
  return requireRole(request, "admin", "moderator");
}

function assertCookieMutationOrigin(
  request: FastifyRequest,
  options: AuthPluginOptions,
  allowedOrigins: ReadonlySet<string>,
): void {
  if (!request.actor || isSafeMethod(request.method)) {
    return;
  }
  if (request.url === "/api/auth/login" || request.url === "/api/auth/register") {
    return;
  }

  const origin = request.headers.origin;
  if (origin === undefined && options.allowMissingOriginForTests) {
    return;
  }
  if (origin === undefined || !allowedOrigins.has(origin)) {
    throw new AppError("ORIGIN_FORBIDDEN", 403, "Request origin is not allowed.");
  }
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}
