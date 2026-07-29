import {
  characterIdSchema,
  fieldMutationRequestSchema,
} from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import type { RealtimeBus } from "../../realtime/realtime-bus.js";
import { FieldService } from "./service.js";

export async function registerFieldRoutes(
  app: FastifyInstance,
  realtime: RealtimeBus,
): Promise<void> {
  const service = new FieldService(app.db, realtime);

  app.put("/api/characters/:id/fields/:fieldId", async (request) => {
    const actor = requireActor(request);
    const params = parseParams(request.params);
    const input = fieldMutationRequestSchema.safeParse(request.body);
    if (!input.success) throw validationError();
    return service.saveCharacterField(
      actor.userId,
      params.id,
      params.fieldId,
      input.data,
    );
  });
}

function parseParams(value: unknown): { id: string; fieldId: string } {
  const params = value as { id?: unknown; fieldId?: unknown };
  const id = characterIdSchema.safeParse(params.id);
  const fieldId = characterIdSchema.safeParse(params.fieldId);
  if (!id.success || !fieldId.success) throw validationError();
  return { id: id.data, fieldId: fieldId.data };
}

function validationError(): AppError {
  return new AppError("VALIDATION_FAILED", 400, "Request validation failed.");
}
