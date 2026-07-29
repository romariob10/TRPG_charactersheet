import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("health and error responses", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      databaseUrl: "postgresql://unreachable:5432/mycharacter",
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("reports liveness without database access", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns the stable error envelope for unknown routes", async () => {
    const response = await app.inject({ method: "GET", url: "/api/test/not-found" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "NOT_FOUND", message: "Resource not found." },
    });
    expect(response.json().error.requestId).toEqual(expect.any(String));
  });

  it("serves PDF.js and Cyrillic font assets from the API", async () => {
    const worker = await app.inject({ method: "GET", url: "/api/pdf-worker" });
    const font = await app.inject({ method: "GET", url: "/api/fonts/noto" });

    expect(worker.statusCode).toBe(200);
    expect(worker.headers["content-type"]).toContain("text/javascript");
    expect(worker.headers["cache-control"]).toContain("immutable");
    expect(worker.rawPayload.byteLength).toBeGreaterThan(1_000);
    expect(font.statusCode).toBe(200);
    expect(font.headers["content-type"]).toContain("font/woff");
    expect(font.rawPayload.byteLength).toBeGreaterThan(1_000);
  });
});
