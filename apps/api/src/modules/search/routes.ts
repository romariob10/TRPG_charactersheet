import { searchQuerySchema } from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { SearchService } from "./service.js";

export async function registerSearchRoutes(app: FastifyInstance): Promise<void> {
  const service = new SearchService(app.db);

  app.get("/api/search", async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid search query.");
    }
    reply.header("Cache-Control", "public, max-age=10, s-maxage=30");
    return service.search(parsed.data);
  });
}
