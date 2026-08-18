import {
  characterIdSchema,
  cloneCharacterRequestSchema,
  createCharacterRequestSchema,
  updateCharacterRequestSchema,
} from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { CharacterService } from "./service.js";

export async function registerCharacterRoutes(app: FastifyInstance): Promise<void> {
  const service = new CharacterService(app.db);

  app.get("/api/characters", async (request) => {
    const actor = requireActor(request);
    return { items: await service.list(actor.userId) };
  });

  app.post("/api/characters", async (request, reply) => {
    const actor = requireActor(request);
    const input = parse(createCharacterRequestSchema, request.body);
    return reply.status(201).send(await service.create(actor.userId, input));
  });

  app.get("/api/characters/:id", async (request) => {
    const actor = requireActor(request);
    const id = parseId(request.params);
    return service.get(actor.userId, id);
  });

  app.get("/api/characters/:id/editor", async (request) => {
    const actor = requireActor(request);
    return service.getEditor(actor.userId, parseId(request.params));
  });

  app.patch("/api/characters/:id", async (request) => {
    const actor = requireActor(request);
    const id = parseId(request.params);
    const input = parse(updateCharacterRequestSchema, request.body);
    return service.update(actor.userId, id, input);
  });

  app.post("/api/characters/:id/clone", async (request, reply) => {
    const actor = requireActor(request);
    const id = parseId(request.params);
    const input = parse(cloneCharacterRequestSchema, request.body ?? {});
    return reply.status(201).send(await service.clone(actor.userId, id, input.name));
  });

  app.post("/api/characters/:id/trash", async (request) => {
    const actor = requireActor(request);
    return service.trash(actor.userId, parseId(request.params));
  });

  app.post("/api/characters/:id/restore", async (request) => {
    const actor = requireActor(request);
    return service.restore(actor.userId, parseId(request.params));
  });

  app.delete("/api/characters/:id", async (request, reply) => {
    const actor = requireActor(request);
    await service.permanentlyDelete(actor.userId, parseId(request.params));
    return reply.status(204).send();
  });

  app.post("/api/characters/:id/invites", async (request, reply) => {
    const actor = requireActor(request);
    return reply
      .status(201)
      .send(await service.createInvite(actor.userId, parseId(request.params)));
  });
}

function parseId(params: unknown): string {
  const value = (params as { id?: unknown }).id;
  const parsed = characterIdSchema.safeParse(value);
  if (!parsed.success) throw validationError();
  return parsed.data;
}

function parse<T>(
  schema: {
    // eslint-disable-next-line no-unused-vars -- The parser accepts an untrusted request body.
    safeParse: (value: unknown) => { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw validationError();
  return parsed.data;
}

function validationError(): AppError {
  return new AppError("VALIDATION_FAILED", 400, "Request validation failed.");
}
