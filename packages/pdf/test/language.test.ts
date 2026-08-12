import { describe, expect, it } from "vitest";
import {
  detectCatalogLanguage,
  harmonizeCatalogLanguage,
  isCatalogTextInLanguage,
  type ExtractedCatalogField,
  type TextToken,
} from "../src/index.js";

function token(text: string): TextToken {
  return {
    text,
    page: 1,
    rect: [0, 0, 0.2, 0.04],
    fontSize: 12,
    source: "pdf",
  };
}

function field(
  pdfName: string,
  label = pdfName,
  section: string | null = "Attributes",
): ExtractedCatalogField {
  return {
    id: crypto.randomUUID(),
    pdfName,
    kind: "text",
    defaultValue: null,
    options: [],
    page: 1,
    label,
    aliases: [],
    section,
    groupId: null,
    groupOrder: null,
    confidence: 0,
    source: "pdf",
    widgets: [
      {
        page: 1,
        rect: [0.2, 0.2, 0.4, 0.25],
        pdfRect: [10, 10, 20, 20],
        rotation: 0,
        exportValue: null,
        widgetIndex: 0,
      },
    ],
  };
}

describe("catalog language consistency", () => {
  it("detects Russian from visible sheet text despite English game terms", () => {
    expect(
      detectCatalogLanguage([
        token("Имя персонажа"),
        token("Сила Ловкость Телосложение"),
        token("Dungeons & Dragons 5e"),
      ]),
    ).toBe("ru");
  });

  it("keeps technical AcroForm names out of Russian labels and sections", () => {
    const harmonized = harmonizeCatalogLanguage(
      [
        field("strength"),
        field("characterName"),
        field("mysteryBox"),
        field("wisdom", "Мудрость", "Характеристики"),
      ],
      "ru",
    );

    expect(harmonized.map((item) => item.label)).toEqual([
      "Сила",
      "Имя персонажа",
      "Текстовое поле 1",
      "Мудрость",
    ]);
    expect(harmonized.map((item) => item.section)).toEqual([
      "Характеристики",
      "Характеристики",
      "Характеристики",
      "Характеристики",
    ]);
    expect(
      harmonized.every((item) =>
        isCatalogTextInLanguage(item.label, "ru"),
      ),
    ).toBe(true);
    expect(harmonized.map((item) => item.pdfName)).toEqual([
      "strength",
      "characterName",
      "mysteryBox",
      "wisdom",
    ]);
    expect(isCatalogTextInLanguage("Класс AC", "ru")).toBe(false);
  });
});
