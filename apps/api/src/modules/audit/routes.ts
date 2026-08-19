import { listAdminAuditEventsQuerySchema } from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { AuditService } from "./service.js";

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  const service = new AuditService(app.db);

  app.get("/api/admin/audit", async (request, reply) => {
    const actor = requireActor(request);
    if (actor.role !== "admin" && actor.role !== "moderator") {
      throw new AppError(
        "FORBIDDEN",
        403,
        "Insufficient permissions to view audit log.",
      );
    }

    const query = listAdminAuditEventsQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid query parameters.");
    }

    reply.header("Cache-Control", "private, no-store");

    // Moderators only see moderation target types
    const allowedTargetTypes =
      actor.role === "moderator"
        ? [
            "post",
            "comment",
            "character",
            "template",
            "report",
            "user_restriction",
          ]
        : undefined;

    return service.list(query.data, allowedTargetTypes);
  });
}
