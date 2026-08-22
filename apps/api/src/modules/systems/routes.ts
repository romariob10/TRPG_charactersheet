import type { FastifyInstance } from "fastify";
import {
  createGameSystemRequestSchema,
  updateGameSystemRequestSchema,
} from "@mycharacter/contracts";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { GameSystemsService } from "./service.js";

export async function registerGameSystemRoutes(app: FastifyInstance): Promise<void> {
  const service = new GameSystemsService(app.db);

  app.get("/api/game-systems", async (request, reply) => {
    reply.header("Cache-Control", "private, no-cache");
    return service.list(request.actor?.userId);
  });

  app.post("/api/game-systems", async (request, reply) => {
    const actor = requireActor(request);
    const parsed = createGameSystemRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid game system payload.");
    }
    const created = await service.create(actor.userId, parsed.data);
    return reply.status(201).send(created);
  });

  app.get("/api/game-systems/:id", async (request, reply) => {
    reply.header("Cache-Control", "public, max-age=60");
    const { id } = request.params as { id: string };
    return service.get(request.actor?.userId ?? null, id);
  });

  app.get("/api/game-systems/:id/workspace", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    const { id } = request.params as { id: string };
    return service.getWorkspace(actor.userId, id);
  });

  app.patch("/api/game-systems/:id", async (request) => {
    const actor = requireActor(request);
    const { id } = request.params as { id: string };
    const parsed = updateGameSystemRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid game system update payload.");
    }
    return service.update(actor.userId, id, parsed.data);
  });

  app.delete("/api/game-systems/:id", async (request, reply) => {
    const actor = requireActor(request);
    const { id } = request.params as { id: string };
    await service.delete(actor.userId, id);
    return reply.status(204).send();
  });
}
