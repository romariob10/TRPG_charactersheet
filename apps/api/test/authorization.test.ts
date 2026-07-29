import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { requireActor } from "../src/plugins/auth.js";

describe("authorization primitive", () => {
  it("returns the authenticated actor and rejects anonymous requests", () => {
    const actor = { userId: "00000000-0000-4000-8000-000000000001", sessionId: "00000000-0000-4000-8000-000000000002" };

    expect(requireActor({ actor } as FastifyRequest)).toEqual(actor);
    let error: unknown;
    try {
      requireActor({ actor: null } as FastifyRequest);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      code: "AUTH_REQUIRED",
      statusCode: 401,
    });
  });
});
