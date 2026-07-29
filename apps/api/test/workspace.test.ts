import { describe, expect, it } from "vitest";
import { fieldValueSchema } from "@mycharacter/contracts";

describe("workspace", () => {
  it("resolves shared contracts", () => {
    expect(fieldValueSchema.parse(["Common", "Elvish"])).toEqual([
      "Common",
      "Elvish",
    ]);
  });
});
