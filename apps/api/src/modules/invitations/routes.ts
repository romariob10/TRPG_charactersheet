import { acceptInvitationRequestSchema } from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { CharacterService } from "../characters/service.js";

export async function registerInvitationRoutes(app: FastifyInstance): Promise<void> {
  const service = new CharacterService(app.db);
  app.post("/api/invitations/accept", async (request) => {
    const actor = requireActor(request);
    const parsed = acceptInvitationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Request validation failed.");
    }
    return service.acceptInvite(actor.userId, parsed.data.token);
  });
}
