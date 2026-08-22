import type { FastifyInstance } from "fastify";
import {
  addRepeaterRowRequestSchema,
  deleteRepeaterRowRequestSchema,
  reorderRepeaterRowsRequestSchema,
  updateRepeaterRowFieldRequestSchema,
} from "@mycharacter/contracts";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { RepeaterService } from "./service.js";

export async function registerRepeaterRoutes(app: FastifyInstance): Promise<void> {
  const service = new RepeaterService(app.db);

  app.get("/api/characters/:id/repeaters/:key/rows", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    const { id, key } = request.params as { id: string; key: string };
    return service.listRows(actor.userId, id, key);
  });

  app.post("/api/characters/:id/repeaters/rows", async (request, reply) => {
    const actor = requireActor(request);
    const { id } = request.params as { id: string };
    const parsed = addRepeaterRowRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid add row payload.");
    }
    const created = await service.addRow(actor.userId, id, parsed.data);
    return reply.status(201).send(created);
  });

  app.put(
    "/api/characters/:id/repeaters/rows/:rowId/slots/:slotId",
    async (request) => {
      const actor = requireActor(request);
      const { id, rowId, slotId } = request.params as {
        id: string;
        rowId: string;
        slotId: string;
      };
      const parsed = updateRepeaterRowFieldRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid update row payload.");
      }
      return service.updateRowField(
        actor.userId,
        id,
        rowId,
        slotId,
        parsed.data,
      );
    },
  );

  app.delete("/api/characters/:id/repeaters/rows/:rowId", async (request) => {
    const actor = requireActor(request);
    const { id, rowId } = request.params as { id: string; rowId: string };
    const parsed = deleteRepeaterRowRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid delete row payload.");
    }
    return service.removeRow(
      actor.userId,
      id,
      rowId,
      parsed.data.clientMutationId,
    );
  });

  app.put("/api/characters/:id/repeaters/reorder", async (request) => {
    const actor = requireActor(request);
    const { id } = request.params as { id: string };
    const parsed = reorderRepeaterRowsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid reorder payload.");
    }
    return service.reorderRows(actor.userId, id, parsed.data);
  });
}
