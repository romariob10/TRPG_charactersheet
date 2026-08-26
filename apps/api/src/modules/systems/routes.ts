import type { FastifyInstance } from "fastify";
import {
  createGameSystemRequestSchema,
  gameSystemIdSchema,
  gameSystemScopeSchema,
  updateGameSystemRequestSchema,
  updateOfficialGameSystemRequestSchema,
} from "@mycharacter/contracts";
import { AppError } from "../../errors.js";
import { requireActor, requireAdmin } from "../../plugins/auth.js";
import { AuditService } from "../audit/service.js";
import { GameSystemsService } from "./service.js";

export async function registerGameSystemRoutes(app: FastifyInstance): Promise<void> {
  const service = new GameSystemsService(app.db);

  app.get("/api/game-systems", async (request, reply) => {
    reply.header("Cache-Control", "private, no-cache");
    const parsed = gameSystemScopeSchema.safeParse(
      (request.query as { scope?: unknown }).scope ?? "all",
    );
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid game system scope.");
    }
    return service.list(request.actor?.userId, parsed.data);
  });

  app.get("/api/admin/game-systems", async (request, reply) => {
    await requireAdmin(request, app.db);
    reply.header("Cache-Control", "private, no-store");
    return service.listForAdmin();
  });

  app.patch("/api/admin/game-systems/:id/official", async (request) => {
    const actor = await requireAdmin(request, app.db);
    const id = gameSystemIdSchema.safeParse(
      (request.params as { id?: unknown }).id,
    );
    const body = updateOfficialGameSystemRequestSchema.safeParse(request.body);
    if (!id.success || !body.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid official system update.");
    }
    const updated = await service.setOfficial(id.data, body.data.isOfficial);
    await new AuditService(app.db).log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: "set_official_game_system",
      targetType: "game_system",
      targetId: id.data,
      metadata: { isOfficial: body.data.isOfficial },
    });
    return updated;
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
