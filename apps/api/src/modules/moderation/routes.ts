import {
  createContentReportRequestSchema,
  listContentReportsQuerySchema,
  resolveReportRequestSchema,
} from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor, requireModerator } from "../../plugins/auth.js";
import { ModerationService } from "./service.js";

export async function registerModerationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const service = new ModerationService(app.db);

  // User submits a content report
  app.post("/api/reports", async (request) => {
    const actor = requireActor(request);
    const parsed = createContentReportRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_FAILED",
        400,
        "Request validation failed.",
      );
    }
    return service.createReport(actor.userId, parsed.data);
  });

  // Moderators list reports in queue
  app.get("/api/admin/reports", async (request, reply) => {
    await requireModerator(request);
    reply.header("Cache-Control", "private, no-store");

    const parsed = listContentReportsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid query parameters.");
    }
    return service.listReports(parsed.data);
  });

  // Moderator resolves or dismisses report
  app.put("/api/admin/reports/:id/resolve", async (request) => {
    const actor = await requireModerator(request);
    const reportId = (request.params as { id: string }).id;
    const parsed = resolveReportRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_FAILED",
        400,
        "Request validation failed.",
      );
    }
    return service.resolveReport(actor, reportId, parsed.data);
  });
}
