import type { Database } from "@mycharacter/database";
import "fastify";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import { AppError } from "../errors.js";
import { findActiveSession, touchSessionIfStale } from "../modules/auth/session-repository.js";

export const sessionCookieName = "mycharacter_session";
export const sessionCookieMaxAge = 60 * 60 * 24 * 30;

export interface Actor {
  userId: string;
  sessionId: string;
}

export interface AuthPluginOptions {
  database?: Kysely<Database>;
  publicOrigin: string;
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

    request.actor = { userId: session.userId, sessionId: session.sessionId };
    assertCookieMutationOrigin(request, options);
    await touchSessionIfStale(db, session);
  });
}

export function requireActor(request: FastifyRequest): Actor {
  if (!request.actor) {
    throw new AppError("AUTH_REQUIRED", 401, "Authentication is required.");
  }
  return request.actor;
}

function assertCookieMutationOrigin(request: FastifyRequest, options: AuthPluginOptions): void {
  if (!request.actor || isSafeMethod(request.method)) {
    return;
  }

  const origin = request.headers.origin;
  if (origin === undefined && options.allowMissingOriginForTests) {
    return;
  }
  if (origin !== options.publicOrigin) {
    throw new AppError("ORIGIN_FORBIDDEN", 403, "Request origin is not allowed.");
  }
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}
