import type { FastifyInstance } from "fastify";
import { requireActor } from "../../plugins/auth.js";
import { NotificationService } from "./service.js";

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  const service = new NotificationService(app.db);

  app.get("/api/notifications", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    const limit = (request.query as { limit?: string })?.limit;
    return service.list(actor.userId, limit ? Number(limit) : 30);
  });

  app.put("/api/notifications/:id/read", async (request) => {
    const actor = requireActor(request);
    const id = (request.params as { id: string }).id;
    await service.markRead(actor.userId, id);
    return { success: true };
  });

  app.put("/api/notifications/read-all", async (request) => {
    const actor = requireActor(request);
    await service.markAllRead(actor.userId);
    return { success: true };
  });
}
