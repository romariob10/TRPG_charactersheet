import { describe, expect, it } from "vitest";
import {
  MAX_SLUG_BASE_LENGTH,
  slugCandidate,
  slugifyTemplateTitle,
} from "../src/modules/templates/slug.js";

describe("slugifyTemplateTitle", () => {
  it.each([
    ["D&D 5e", "d-d-5e"],
    ["Лист персонажа", "list-personazha"],
    ["  Hello   World!  ", "hello-world"],
    ["Щит и Кубик", "shchit-i-kubik"],
    ["a", "a"],
    ["", "template"],
    ["!!! ???", "template"],
    ["Мой---шаблон", "moy-shablon"],
    ["Ünïcödé Latin", "n-c-d-latin"],
  ])("converts %j to %j", (input, expected) => {
    expect(slugifyTemplateTitle(input)).toBe(expected);
  });

  it("limits the base length and trims trailing separators", () => {
    const slug = slugifyTemplateTitle("a".repeat(200));
    expect(slug).toHaveLength(MAX_SLUG_BASE_LENGTH);
    const trimmed = slugifyTemplateTitle(`${"b".repeat(72)} ---`);
    expect(trimmed).toBe("b".repeat(72));
    const cutOnSeparator = slugifyTemplateTitle(`${"c".repeat(71)} ${"d".repeat(40)}`);
    expect(cutOnSeparator.length).toBeLessThanOrEqual(MAX_SLUG_BASE_LENGTH);
    expect(cutOnSeparator).not.toMatch(/-$/);
  });

  it("always produces a CHECK-conforming slug", () => {
    const samples = [
      "D&D 5e",
      "Лист персонажа",
      "-leading",
      "trailing-",
      "x".repeat(300),
      "123 numeric",
    ];
    for (const sample of samples) {
      expect(slugifyTemplateTitle(sample)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe("slugCandidate", () => {
  it("returns the base for the first attempt and suffixes afterwards", () => {
    expect(slugCandidate("d-d-5e", 1)).toBe("d-d-5e");
    expect(slugCandidate("d-d-5e", 2)).toBe("d-d-5e-2");
    expect(slugCandidate("d-d-5e", 3)).toBe("d-d-5e-3");
  });

  it("keeps suffixed candidates within 80 characters", () => {
    const base = "s".repeat(72);
    expect(slugCandidate(base, 12)).toHaveLength(75);
    expect(slugCandidate(base, 12)).toBe(`${"s".repeat(72)}-12`);
  });
});
