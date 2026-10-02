import { z } from "zod";
import {
  agentPresenceRequestSchema,
  agentResourceSchema,
  createAgentTokenRequestSchema,
} from "@mycharacter/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireActor } from "../../plugins/auth.js";
import { AppError } from "../../errors.js";
import { AgentService } from "./service.js";

function browserOwner(request: FastifyRequest) {
  const actor = requireActor(request);
  if (actor.agentTokenId)
    throw new AppError(
      "SESSION_REQUIRED",
      403,
      "Manage agent tokens from your profile.",
    );
  return actor;
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new AppError("VALIDATION_FAILED", 400, "Invalid agent request.");
  return parsed.data;
}
export async function registerAgentRoutes(app: FastifyInstance) {
  const service = new AgentService(app.db);
  app.get("/api/agent-tokens", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    return service.list(browserOwner(request).userId);
  });
  app.post(
    "/api/agent-tokens",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const actor = browserOwner(request);
      reply.header("Cache-Control", "private, no-store");
      return reply
        .status(201)
        .send(
          await service.create(
            actor.userId,
            parse(createAgentTokenRequestSchema, request.body),
          ),
        );
    },
  );
  app.delete("/api/agent-tokens/:id", async (request, reply) => {
    const actor = browserOwner(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    await service.revoke(actor.userId, id);
    return reply.status(204).send();
  });
  app.get("/api/characters/:id/sheet-state", async (request, reply) => {
    const actor = requireActor(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    await service.assertAccess(actor.userId, {
      resourceType: "character",
      resourceId: id,
    });
    const rows = await app.db
      .selectFrom("character_sheet_field_values")
      .select(["field_key", "value", "version"])
      .where("character_id", "=", id)
      .execute();
    reply.header("Cache-Control", "private, no-store");
    return {
      values: Object.fromEntries(rows.map((row) => [row.field_key, row.value])),
      versions: Object.fromEntries(
        rows.map((row) => [row.field_key, row.version]),
      ),
    };
  });
  app.get("/api/agent-presence", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    return service.presence(
      actor.userId,
      parse(agentResourceSchema, request.query),
    );
  });
  app.put("/api/agent-presence", async (request, reply) => {
    const actor = requireActor(request);
    if (!actor.agentTokenId)
      throw new AppError("AGENT_REQUIRED", 403, "An agent token is required.");
    await service.updatePresence(
      actor.userId,
      actor.agentTokenId,
      parse(agentPresenceRequestSchema, request.body),
    );
    return reply.status(204).send();
  });
  app.delete("/api/agent-presence", async (request, reply) => {
    const actor = requireActor(request);
    if (!actor.agentTokenId)
      throw new AppError("AGENT_REQUIRED", 403, "An agent token is required.");
    await service.updatePresence(actor.userId, actor.agentTokenId, null);
    return reply.status(204).send();
  });
}
