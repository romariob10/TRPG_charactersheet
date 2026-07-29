import { characterIdSchema } from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { ExportService, type ExportMode } from "./service.js";

export async function registerExportRoutes(app: FastifyInstance): Promise<void> {
  const service = new ExportService(app.db, app.storage);

  app.post("/api/characters/:id/export", async (request, reply) => {
    const actor = requireActor(request);
    const id = characterIdSchema.safeParse(
      (request.params as { id?: unknown }).id,
    );
    const mode = parseMode((request.query as { mode?: unknown }).mode);
    if (!id.success) throw validationError();
    const exported = await service.exportCharacter(actor.userId, id.data, mode);
    const asciiName = exported.filename.replace(/[^\x20-\x7E]/g, "_");
    return reply
      .header("cache-control", "private, no-store")
      .header("content-type", "application/pdf")
      .header(
        "content-disposition",
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(exported.filename)}`,
      )
      .send(Buffer.from(exported.bytes));
  });
}

function parseMode(value: unknown): ExportMode {
  if (value === "interactive" || value === "flattened") return value;
  throw validationError();
}

function validationError(): AppError {
  return new AppError("VALIDATION_FAILED", 400, "Request validation failed.");
}
