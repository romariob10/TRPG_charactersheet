import type { FastifyInstance } from "fastify";
import {
  autosaveComponentDraftRequestSchema,
  createComponentRequestSchema,
  forkComponentRequestSchema,
  listComponentsQuerySchema,
  publishComponentVersionRequestSchema,
} from "@mycharacter/contracts";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { ComponentLibraryService } from "./service.js";
import { z } from "zod";

const idParamsSchema = z.object({ id: z.string().uuid() });
const versionParamsSchema = z.object({ versionId: z.string().uuid() });

function parseParams<T>(schema: z.ZodType<T>, params: unknown): T {
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", 400, "Invalid route parameters.");
  return parsed.data;
}

export async function registerComponentRoutes(
  app: FastifyInstance,
): Promise<void> {
  const service = new ComponentLibraryService(app.db);

  app.get("/api/components", async (request, reply) => {
    reply.header("Cache-Control", "private, no-cache");
    const parsedQuery = listComponentsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid query parameters.");
    }
    return service.listComponents(request.actor?.userId ?? null, parsedQuery.data);
  });

  app.post("/api/components", async (request, reply) => {
    const actor = requireActor(request);
    const parsed = createComponentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid component creation payload.");
    }
    const created = await service.createComponent(actor.userId, parsed.data);
    return reply.status(201).send(created);
  });

  app.get("/api/components/:id", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const { id } = parseParams(idParamsSchema, request.params);
    return service.getComponent(request.actor?.userId ?? null, id);
  });

  app.put("/api/components/:id/draft", async (request) => {
    const actor = requireActor(request);
    const { id } = parseParams(idParamsSchema, request.params);
    const parsed = autosaveComponentDraftRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid component draft payload.");
    }
    return service.autosaveComponentDraft(actor.userId, id, parsed.data);
  });

  app.post("/api/components/:id/publish", async (request, reply) => {
    const actor = requireActor(request);
    const { id } = parseParams(idParamsSchema, request.params);
    const parsed = publishComponentVersionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid publish payload.");
    }
    const result = await service.publishComponentVersion(actor.userId, id, parsed.data);
    return reply.status(200).send(result);
  });

  app.post("/api/components/:id/fork", async (request, reply) => {
    const actor = requireActor(request);
    const { id } = parseParams(idParamsSchema, request.params);
    const parsed = forkComponentRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid fork payload.");
    }
    const forked = await service.forkComponent(actor.userId, id, parsed.data);
    return reply.status(201).send(forked);
  });

  app.get("/api/components/versions/:versionId", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    const { versionId } = parseParams(versionParamsSchema, request.params);
    return service.getComponentVersion(actor.userId, versionId);
  });
}
