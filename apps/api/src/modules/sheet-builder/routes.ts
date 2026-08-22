import type { FastifyInstance } from "fastify";
import {
  autosaveSheetDraftRequestSchema,
  createSheetDefinitionRequestSchema,
  publishSheetVersionRequestSchema,
} from "@mycharacter/contracts";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { SheetBuilderService } from "./service.js";

export async function registerSheetBuilderRoutes(
  app: FastifyInstance,
): Promise<void> {
  const service = new SheetBuilderService(app.db);

  app.post("/api/sheet-definitions", async (request, reply) => {
    const actor = requireActor(request);
    const parsed = createSheetDefinitionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid sheet definition payload.");
    }
    const created = await service.createSheetDefinition(actor.userId, parsed.data);
    return reply.status(201).send(created);
  });

  app.get("/api/sheet-definitions/:id/editor", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    const { id } = request.params as { id: string };
    return service.getSheetEditorData(actor.userId, id);
  });

  app.put("/api/sheet-definitions/:id/draft", async (request) => {
    const actor = requireActor(request);
    const { id } = request.params as { id: string };
    const parsed = autosaveSheetDraftRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid sheet draft payload.");
    }
    return service.autosaveSheetDraft(actor.userId, id, parsed.data);
  });

  app.post("/api/sheet-definitions/:id/publish", async (request, reply) => {
    const actor = requireActor(request);
    const { id } = request.params as { id: string };
    const parsed = publishSheetVersionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid publish request payload.");
    }
    const result = await service.publishSheetVersion(actor.userId, id, parsed.data);
    return reply.status(200).send(result);
  });

  app.get("/api/sheet-definitions/:id/versions", async (request, reply) => {
    reply.header("Cache-Control", "public, max-age=60");
    const { id } = request.params as { id: string };
    return service.listSheetVersions(id);
  });

  app.get("/api/sheet-versions/:versionId", async (request, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    const { versionId } = request.params as { versionId: string };
    return service.getSheetVersion(versionId);
  });
}
