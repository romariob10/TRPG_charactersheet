import {
  templateIdSchema,
  templateScopeSchema,
  updateTemplateFieldRequestSchema,
  updateTemplateRequestSchema,
} from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { TemplateService } from "./service.js";

export async function registerTemplateRoutes(app: FastifyInstance): Promise<void> {
  const service = new TemplateService(app.db);

  app.get("/api/templates", async (request) => {
    const actor = requireActor(request);
    const scope = templateScopeSchema.safeParse(
      (request.query as { scope?: unknown }).scope ?? "mine",
    );
    if (!scope.success) throw validationError();
    return { items: await service.list(actor.userId, scope.data) };
  });

  app.get("/api/templates/:id", async (request) => {
    const actor = requireActor(request);
    return service.get(actor.userId, parseId(request.params));
  });

  app.get("/api/templates/:id/editor", async (request) => {
    const actor = requireActor(request);
    return service.getEditor(actor.userId, parseId(request.params));
  });

  app.patch("/api/templates/:id", async (request) => {
    const actor = requireActor(request);
    const input = updateTemplateRequestSchema.safeParse(request.body);
    if (!input.success) throw validationError();
    return service.update(actor.userId, parseId(request.params), input.data);
  });

  app.post("/api/templates/:id/subscription", async (request, reply) => {
    const actor = requireActor(request);
    await service.subscribe(actor.userId, parseId(request.params));
    return reply.status(204).send();
  });

  app.delete("/api/templates/:id/subscription", async (request, reply) => {
    const actor = requireActor(request);
    await service.unsubscribe(actor.userId, parseId(request.params));
    return reply.status(204).send();
  });

  app.post("/api/templates/:id/approve", async (request) => {
    const actor = requireActor(request);
    return service.approve(actor.userId, parseId(request.params));
  });

  app.patch("/api/templates/:id/fields/:fieldId", async (request) => {
    const actor = requireActor(request);
    const { id, fieldId } = parseFieldParams(request.params);
    const input = updateTemplateFieldRequestSchema.safeParse(request.body);
    if (!input.success) throw validationError();
    return {
      field: await service.updateField(actor.userId, id, fieldId, input.data),
    };
  });

  app.delete("/api/templates/:id", async (request, reply) => {
    const actor = requireActor(request);
    await service.trash(actor.userId, parseId(request.params));
    return reply.status(204).send();
  });

  app.post("/api/templates/:id/restore", async (request) => {
    const actor = requireActor(request);
    return service.restore(actor.userId, parseId(request.params));
  });
}

function parseId(params: unknown): string {
  const parsed = templateIdSchema.safeParse((params as { id?: unknown }).id);
  if (!parsed.success) throw validationError();
  return parsed.data;
}

function parseFieldParams(params: unknown): { id: string; fieldId: string } {
  const value = params as { id?: unknown; fieldId?: unknown };
  const id = templateIdSchema.safeParse(value.id);
  const fieldId = templateIdSchema.safeParse(value.fieldId);
  if (!id.success || !fieldId.success) throw validationError();
  return { id: id.data, fieldId: fieldId.data };
}

function validationError(): AppError {
  return new AppError("VALIDATION_FAILED", 400, "Request validation failed.");
}
