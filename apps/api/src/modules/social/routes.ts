import {
  commentIdSchema,
  createTemplateCommentRequestSchema,
  templateIdSchema,
} from "@mycharacter/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { SocialService } from "./service.js";

const USERNAME_PATH_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;
const SLUG_PATH_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const commentRateLimit = {
  max: 10,
  timeWindow: 60_000,
  keyGenerator: (request: FastifyRequest) =>
    request.actor?.userId ?? request.ip,
  errorResponseBuilder: () =>
    new AppError("RATE_LIMITED", 429, "Too many comments. Please try again later."),
};

export async function registerSocialRoutes(app: FastifyInstance): Promise<void> {
  const service = new SocialService(app.db);

  app.put("/api/templates/:id/like", async (request, reply) => {
    const actor = requireActor(request);
    await service.like(actor.userId, parseId(request.params));
    return reply.status(204).send();
  });

  app.delete("/api/templates/:id/like", async (request, reply) => {
    const actor = requireActor(request);
    await service.unlike(actor.userId, parseId(request.params));
    return reply.status(204).send();
  });

  app.get("/api/templates/:id/comments", async (request) => {
    const templateId = parseId(request.params);
    const query = request.query as { cursor?: unknown; limit?: unknown };
    const cursor =
      query.cursor === undefined ? undefined : parseString(query.cursor, "cursor");
    let limit: number | undefined;
    if (query.limit !== undefined) {
      const parsed = Number(query.limit);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
        throw validationError();
      }
      limit = parsed;
    }
    return service.listComments(templateId, cursor, limit);
  });

  app.post(
    "/api/templates/:id/comments",
    { config: { rateLimit: commentRateLimit } },
    async (request, reply) => {
      const actor = requireActor(request);
      const input = createTemplateCommentRequestSchema.safeParse(request.body);
      if (!input.success) throw validationError();
      const comment = await service.addComment(
        actor.userId,
        parseId(request.params),
        input.data.body,
      );
      return reply.status(201).send(comment);
    },
  );

  app.delete("/api/templates/:id/comments/:commentId", async (request, reply) => {
    const actor = requireActor(request);
    const { id, commentId } = parseCommentParams(request.params);
    await service.deleteComment(actor.userId, id, commentId);
    return reply.status(204).send();
  });

  app.get("/api/community/:username/:slug", async (request) => {
    const params = request.params as { username?: unknown; slug?: unknown };
    if (
      typeof params.username !== "string" ||
      !USERNAME_PATH_PATTERN.test(params.username) ||
      typeof params.slug !== "string" ||
      !SLUG_PATH_PATTERN.test(params.slug) ||
      params.slug.length > 80
    ) {
      throw new AppError("TEMPLATE_NOT_FOUND", 404, "Template not found.");
    }
    return service.getCommunityDetails(
      request.actor?.userId ?? null,
      params.username,
      params.slug,
    );
  });
}

function parseId(params: unknown): string {
  const parsed = templateIdSchema.safeParse((params as { id?: unknown }).id);
  if (!parsed.success) throw validationError();
  return parsed.data;
}

function parseCommentParams(params: unknown): { id: string; commentId: string } {
  const value = params as { id?: unknown; commentId?: unknown };
  const id = templateIdSchema.safeParse(value.id);
  const commentId = commentIdSchema.safeParse(value.commentId);
  if (!id.success || !commentId.success) throw validationError();
  return { id: id.data, commentId: commentId.data };
}

function parseString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) {
    throw new AppError("VALIDATION_FAILED", 400, `Query parameter ${name} is invalid.`);
  }
  return value;
}

function validationError(): AppError {
  return new AppError("VALIDATION_FAILED", 400, "Request validation failed.");
}
