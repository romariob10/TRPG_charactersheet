import {
  updateMyProfileRequestSchema,
  updateProfilePrivacyRequestSchema,
} from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { ProfileService } from "./service.js";

const USERNAME_PATH_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export async function registerProfileRoutes(app: FastifyInstance): Promise<void> {
  const service = new ProfileService(app.db);

  app.get("/api/profiles/me", async (request) => {
    const actor = requireActor(request);
    return service.getMyProfile(actor.userId);
  });

  app.get("/api/friends", async (request) => {
    const actor = requireActor(request);
    return { items: await service.listFriends(actor.userId) };
  });

  app.get("/api/profiles/feed-authors", async (request) => {
    const actor = requireActor(request);
    return service.listFeedAuthors(actor.userId);
  });

  app.patch("/api/profiles/me", async (request) => {
    const actor = requireActor(request);
    const input = updateMyProfileRequestSchema.safeParse(request.body);
    if (!input.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Request validation failed.");
    }
    return service.updateMyProfile(actor.userId, input.data);
  });

  app.put("/api/profiles/privacy", async (request) => {
    const actor = requireActor(request);
    const input = updateProfilePrivacyRequestSchema.safeParse(request.body);
    if (!input.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Request validation failed.");
    }
    return service.updatePrivacySettings(actor.userId, input.data);
  });

  app.get("/api/profiles/:username", async (request) => {
    const username = (request.params as { username?: unknown }).username;
    if (typeof username !== "string" || !USERNAME_PATH_PATTERN.test(username)) {
      throw new AppError("PROFILE_NOT_FOUND", 404, "Profile not found.");
    }
    return service.getPublicProfile(username, request.actor?.userId ?? null);
  });

  app.put("/api/profiles/:username/follow", async (request, reply) => {
    const actor = requireActor(request);
    const username = parseUsername(request.params);
    await service.follow(actor.userId, username);
    return reply.status(204).send();
  });

  app.delete("/api/profiles/:username/follow", async (request, reply) => {
    const actor = requireActor(request);
    const username = parseUsername(request.params);
    await service.unfollow(actor.userId, username);
    return reply.status(204).send();
  });
}

function parseUsername(params: unknown): string {
  const username = (params as { username?: unknown }).username;
  if (typeof username !== "string" || !USERNAME_PATH_PATTERN.test(username)) {
    throw new AppError("PROFILE_NOT_FOUND", 404, "Profile not found.");
  }
  return username;
}
