import { describe, expect, it } from "vitest";
import { CHARACTER_FONT_SIZE_FIELD, characterFontSizeSchema, getCharacterFontSize } from "../src/sheet-appearance.js";
import { layoutNodeSchema, textareaNodeSchema } from "../src/sheet-blueprints.js";
import { fieldValueSchema } from "../src/characters.js";
import { getSingleLineFontSize, getTextareaListItems, upgradeLegacyFateTextLists } from "../src/sheet-appearance.js";

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


it("validates list configuration and keeps existing multiline items when adopting a list", () => {
  const node = textareaNodeSchema.parse({ id: crypto.randomUUID(), kind: "textarea", fieldBinding: "items", listStyle: "lined", itemCount: 2, itemBindings: ["old_a", "old_b"] });
  expect(getTextareaListItems(node, { old_a: "First\ncontinued", old_b: "Second" })).toEqual(["First\ncontinued", "Second"]);
  expect(getTextareaListItems(node, { items: ["Updated", "Second"], old_a: "Old" })).toEqual(["Updated", "Second"]);
  expect(getTextareaListItems({ ...node, allowItemCountChange: true }, { items: ["Only one"] })).toEqual(["Only one"]);
  expect(getTextareaListItems({ ...node, itemBindings: undefined }, { items: "First\nSecond" })).toEqual(["First", "Second"]);
  expect(fieldValueSchema.safeParse(["long ".repeat(600)]).success).toBe(true);
  for (const itemCount of [0, 51, 1.5]) expect(textareaNodeSchema.safeParse({ ...node, itemCount }).success).toBe(false);
  expect(textareaNodeSchema.safeParse({ ...node, listStyle: "invalid" }).success).toBe(false);
  expect(getSingleLineFontSize(24)).toBe(14);
  expect(getSingleLineFontSize(40)).toBe(24);
});

it("adapts legacy Fate ruled fields without changing their ids or source layout", () => {
  const original = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "frame", cornerOrnaments: { preset: "fate-turnback" }, children: [
    { id: crypto.randomUUID(), kind: "field-input", fieldBinding: "aspect_1", variant: "underline" },
    { id: crypto.randomUUID(), kind: "field-input", fieldBinding: "aspect_2", variant: "underline" },
  ] });
  const adapted = upgradeLegacyFateTextLists(original);
  expect(layoutNodeSchema.safeParse(adapted).success).toBe(true);
  if (adapted.kind !== "frame" || original.kind !== "frame") throw new Error("Expected frames");
  expect(original.children[0]?.kind).toBe("field-input");
  expect(adapted.children[0]?.id).toBe(original.children[0]?.id);
  const first = adapted.children[0]!;
  if (first.kind !== "textarea") throw new Error("Expected ruled textarea");
  expect(getTextareaListItems(first, { aspect_1: "First\ncontinued" })).toEqual(["First\ncontinued"]);
  expect(getTextareaListItems(first, { aspect_1: ["Updated\ncontinued"] })).toEqual(["Updated\ncontinued"]);
});
