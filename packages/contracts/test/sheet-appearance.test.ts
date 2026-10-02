import { describe, expect, it } from "vitest";
import { CHARACTER_FONT_SIZE_FIELD, characterFontSizeSchema, getCharacterFontSize } from "../src/sheet-appearance.js";

describe("character font preference", () => {
  it("accepts supported integer sizes and defaults missing or invalid preferences", () => {
    expect(characterFontSizeSchema.parse(8)).toBe(8);
    expect(characterFontSizeSchema.parse(24)).toBe(24);
    expect(getCharacterFontSize({ [CHARACTER_FONT_SIZE_FIELD]: 10 })).toBe(10);
    expect(getCharacterFontSize()).toBe(12);
    for (const value of [7, 25, 12.5, "12", null]) {
      expect(characterFontSizeSchema.safeParse(value).success).toBe(false);
      expect(getCharacterFontSize({ [CHARACTER_FONT_SIZE_FIELD]: value })).toBe(12);
    }
  });
});
