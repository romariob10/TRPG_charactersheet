import { characterIdSchema } from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import type { RealtimeBus } from "../../realtime/realtime-bus.js";
import { RealtimeCatchUpService } from "./catch-up.js";
import { RealtimeGateway } from "./gateway.js";

export async function registerRealtimeRoutes(
  app: FastifyInstance,
  bus: RealtimeBus,
  options: { allowedOrigins: readonly string[]; allowMissingOrigin: boolean },
): Promise<void> {
  const gateway = new RealtimeGateway(app.db, bus);
  const catchUp = new RealtimeCatchUpService(app.db);
  const allowedOrigins = new Set(options.allowedOrigins);
  app.addHook("onClose", async () => gateway.close());

  app.get("/api/realtime", { websocket: true }, (socket, request) => {
    const origin = request.headers.origin;
    if (
      (origin === undefined || !allowedOrigins.has(origin)) &&
      !(origin === undefined && options.allowMissingOrigin)
    ) {
      socket.close(4403, "Origin forbidden");
      return;
    }
    gateway.connect(socket, request.actor);
  });

  app.get("/api/characters/:id/changes", async (request) => {
    const actor = requireActor(request);
    const id = characterIdSchema.safeParse((request.params as { id?: unknown }).id);
    const afterRevision = Number(
      (request.query as { afterRevision?: unknown }).afterRevision,
    );
    if (
      !id.success ||
      !Number.isSafeInteger(afterRevision) ||
      afterRevision < 0
    ) {
      throw new AppError("VALIDATION_FAILED", 400, "Request validation failed.");
    }
    return catchUp.getChanges(actor.userId, id.data, afterRevision);
  });
}
