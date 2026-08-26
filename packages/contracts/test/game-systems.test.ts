import { describe, expect, it } from "vitest";
import {
  gameSystemScopeSchema,
  updateOfficialGameSystemRequestSchema,
} from "../src/index.js";

describe("game system contracts", () => {
  it("accepts the supported list scopes", () => {
    expect(gameSystemScopeSchema.parse("all")).toBe("all");
    expect(gameSystemScopeSchema.parse("mine")).toBe("mine");
    expect(gameSystemScopeSchema.parse("official")).toBe("official");
  });

  it("rejects unknown list scopes", () => {
    expect(gameSystemScopeSchema.safeParse("featured").success).toBe(false);
  });

  it("requires an explicit boolean official flag", () => {
    expect(
      updateOfficialGameSystemRequestSchema.parse({ isOfficial: true }),
    ).toEqual({ isOfficial: true });
    expect(
      updateOfficialGameSystemRequestSchema.safeParse({ isOfficial: "yes" })
        .success,
    ).toBe(false);
  });
});
