import { describe, expect, it } from "vitest";
import {
  applyProposalSchema,
  catalogFieldSchema,
  fieldMutationSchema,
  fieldValueSchema,
  renameCharacterSchema,
} from "@/lib/schemas";

describe("field API contracts", () => {
  it("accepts every supported field value shape", () => {
    for (const value of ["wizard", true, ["Misty Step", "Shield"], null]) {
      expect(fieldValueSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects non-idempotent mutation identifiers", () => {
    expect(
      fieldMutationSchema.safeParse({
        value: "18",
        expectedVersion: 2,
        clientMutationId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("requires at least one selected proposal item", () => {
    expect(
      applyProposalSchema.safeParse({
        proposalId: crypto.randomUUID(),
        items: [],
      }).success,
    ).toBe(false);
  });

  it("validates renamed character names", () => {
    expect(
      renameCharacterSchema.safeParse({
        characterId: crypto.randomUUID(),
        name: "  Новый герой  ",
      }).data?.name,
    ).toBe("Новый герой");
    expect(
      renameCharacterSchema.safeParse({
        characterId: crypto.randomUUID(),
        name: " ",
      }).success,
    ).toBe(false);
  });

  it("preserves catalog field and section casing", () => {
    const parsed = catalogFieldSchema.parse({
      label: "  Ловкость  ",
      aliases: [],
      section: " основные характеристики ",
      groupId: null,
      groupOrder: null,
    });

    expect(parsed.label).toBe("Ловкость");
    expect(parsed.section).toBe("основные характеристики");
  });
});
