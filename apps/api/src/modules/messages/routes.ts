import {
  sendMessageRequestSchema,
  startConversationRequestSchema,
} from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { globalRateLimiter } from "../../plugins/rate-limit.js";
import { DirectMessageService } from "./service.js";

export async function registerDirectMessageRoutes(app: FastifyInstance): Promise<void> {
  const service = new DirectMessageService(app.db);

  app.get("/api/messages/conversations", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    return service.listConversations(actor.userId);
  });

  app.post("/api/messages/conversations", async (request, reply) => {
    const actor = requireActor(request);
    const body = startConversationRequestSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid recipient username.");
    }

    const targetProfile = await app.db
      .selectFrom("profiles")
      .select("id")
      .where("username", "=", body.data.recipientUsername.toLowerCase().trim())
      .executeTakeFirst();

    if (!targetProfile) {
      throw new AppError("USER_NOT_FOUND", 404, "Target recipient not found.");
    }

    const convId = await service.getOrCreateConversation(actor.userId, targetProfile.id);

    if (body.data.message) {
      await service.sendMessage(actor.userId, convId, body.data.message);
    }

    reply.status(201);
    return { conversationId: convId };
  });

  app.get("/api/messages/conversations/:id", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    const id = (request.params as { id: string }).id;
    const messages = await service.getMessages(actor.userId, id);
    return { messages };
  });

  app.post("/api/messages/conversations/:id", async (request, reply) => {
    const actor = requireActor(request);
    globalRateLimiter.assertLimit("messages:" + actor.userId, 30, 60000);
    const id = (request.params as { id: string }).id;
    const body = sendMessageRequestSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Message body cannot be empty.");
    }

    const msg = await service.sendMessage(actor.userId, id, body.data.body);
    reply.status(201);
    return msg;
  });
}
