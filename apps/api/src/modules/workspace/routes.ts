import type { FastifyInstance } from "fastify";
import { pinWorkspaceItemRequestSchema } from "@mycharacter/contracts";
import { requireActor } from "../../plugins/auth.js";
import { WorkspaceService } from "./service.js";

export async function registerWorkspaceRoutes(app: FastifyInstance): Promise<void> {
  const service = new WorkspaceService(app.db);

  app.get("/api/workspace/history", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    return service.list(actor.userId);
  });

  app.put("/api/workspace/history/:id/pin", async (request) => {
    const actor = requireActor(request);
    const id = (request.params as { id: string }).id;
    const parsed = pinWorkspaceItemRequestSchema.safeParse(request.body);
    const pinned = parsed.success ? parsed.data.pinned : true;
    await service.setPinned(actor.userId, id, pinned);
    return { success: true };
  });

  app.put("/api/workspace/history/:id/seen", async (request) => {
    const actor = requireActor(request);
    const id = (request.params as { id: string }).id;
    await service.markSeen(actor.userId, id);
    return { success: true };
  });
}
