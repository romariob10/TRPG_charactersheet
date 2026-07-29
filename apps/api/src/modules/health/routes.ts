import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { AppError } from "../../errors.js";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health/live", async () => ({ status: "ok" }));

  app.get("/api/health/ready", async () => {
    try {
      await sql`select 1`.execute(app.db);
      return { status: "ok" };
    } catch {
      throw new AppError(
        "DEPENDENCY_UNAVAILABLE",
        503,
        "PostgreSQL is unavailable.",
      );
    }
  });
}
