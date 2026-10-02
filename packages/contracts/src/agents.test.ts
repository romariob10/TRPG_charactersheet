import { describe, expect, it } from "vitest";
import {
  agentPresenceRequestSchema,
  createAgentTokenRequestSchema,
} from "./agents.js";

describe("agent contracts", () => {
  it("validates token names and bounded expiration", () => {
    expect(createAgentTokenRequestSchema.parse({ name: " Guide " })).toEqual({
      name: "Guide",
      expiresInDays: 90,
    });
    for (const input of [
      { name: " " },
      { name: "Guide", expiresInDays: 0 },
      { name: "Guide", expiresInDays: 366 },
    ]) {
      expect(createAgentTokenRequestSchema.safeParse(input).success).toBe(
        false,
      );
    }
  });
  it("accepts normalized cursor coordinates and rejects invalid resources", () => {
    const input = {
      resourceType: "sheet",
      resourceId: "11111111-1111-4111-8111-111111111111",
      x: 0.25,
      y: 1,
    };
    expect(agentPresenceRequestSchema.safeParse(input).success).toBe(true);
    for (const patch of [
      { x: 2 },
      { y: -1 },
      { resourceId: "invalid" },
      { resourceType: "admin" },
    ]) {
      expect(
        agentPresenceRequestSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
    }
  });
});
