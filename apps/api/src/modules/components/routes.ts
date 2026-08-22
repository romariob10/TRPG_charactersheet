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
    reply.header("Cache-Control", "public, max-age=60");
    const { id } = request.params as { id: string };
    return service.getComponent(request.actor?.userId ?? null, id);
  });

  app.put("/api/components/:id/draft", async (request) => {
    const actor = requireActor(request);
    const { id } = request.params as { id: string };
    const parsed = autosaveComponentDraftRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid component draft payload.");
    }
    return service.autosaveComponentDraft(actor.userId, id, parsed.data);
  });

  app.post("/api/components/:id/publish", async (request, reply) => {
    const actor = requireActor(request);
    const { id } = request.params as { id: string };
    const parsed = publishComponentVersionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid publish payload.");
    }
    const result = await service.publishComponentVersion(actor.userId, id, parsed.data);
    return reply.status(200).send(result);
  });

  app.post("/api/components/:id/fork", async (request, reply) => {
    const actor = requireActor(request);
    const { id } = request.params as { id: string };
    const parsed = forkComponentRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid fork payload.");
    }
    const forked = await service.forkComponent(actor.userId, id, parsed.data);
    return reply.status(201).send(forked);
  });

  app.get("/api/components/versions/:versionId", async (request, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    const { versionId } = request.params as { versionId: string };
    return service.getComponentVersion(versionId);
  });
}
