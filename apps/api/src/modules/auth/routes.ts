import "@fastify/rate-limit";
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  passwordResetRequestSchema,
  registerRequestSchema,
} from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import {
  EmailDeliveryNotConfigured,
  type EmailDelivery,
} from "./email-delivery.js";
import { AuthService } from "./service.js";
import {
  requireActor,
  sessionCookieMaxAge,
  sessionCookieName,
} from "../../plugins/auth.js";

export interface AuthRouteOptions {
  cookieSecure: boolean;
  emailDelivery?: EmailDelivery;
}

const authenticationRateLimit = {
  max: 5,
  timeWindow: 60_000,
  errorResponseBuilder: () => new AppError(
    "RATE_LIMITED",
    429,
    "Too many authentication attempts. Please try again later.",
  ),
};

export async function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthRouteOptions,
): Promise<void> {
  const service = new AuthService(app.db);
  const emailDelivery = options.emailDelivery ?? new EmailDeliveryNotConfigured();
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: options.cookieSecure,
    maxAge: sessionCookieMaxAge,
  };

  app.post(
    "/api/auth/register",
    { config: { rateLimit: authenticationRateLimit } },
    async (request, reply) => {
      const body = parseBody(registerRequestSchema, request.body);
      const user = await service.register(body.email, body.password);
      reply.setCookie(sessionCookieName, user.session.token, cookieOptions);
      return reply.status(201).send({ user: { id: user.id, email: user.email } });
    },
  );

  app.post(
    "/api/auth/login",
    { config: { rateLimit: authenticationRateLimit } },
    async (request, reply) => {
      const body = parseBody(loginRequestSchema, request.body);
      const user = await service.login(body.email, body.password);
      reply.setCookie(sessionCookieName, user.session.token, cookieOptions);
      return { user: { id: user.id, email: user.email } };
    },
  );

  app.get("/api/auth/session", async (request) => {
    const actor = requireActor(request);
    return { user: await service.getUser(actor.userId) };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const actor = requireActor(request);
    await service.logout(actor.sessionId);
    reply.clearCookie(sessionCookieName, cookieOptions);
    return reply.status(204).send();
  });

  app.post("/api/auth/change-password", async (request, reply) => {
    const actor = requireActor(request);
    const body = parseBody(changePasswordRequestSchema, request.body);
    const session = await service.changePassword(
      actor.userId,
      actor.sessionId,
      body.currentPassword,
      body.newPassword,
    );
    reply.setCookie(sessionCookieName, session.token, cookieOptions);
    return { user: await service.getUser(actor.userId) };
  });

  app.post("/api/auth/request-password-reset", async (request) => {
    const body = parseBody(passwordResetRequestSchema, request.body);
    await emailDelivery.sendPasswordReset({ email: body.email });
  });
}

function parseBody<T>(
  schema: {
    // eslint-disable-next-line no-unused-vars -- The parser accepts an untrusted request body.
    safeParse: (value: unknown) =>
      | { success: true; data: T }
      | { success: false; error: unknown };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", 400, "Request validation failed.");
  }
  return parsed.data;
}
