import { describe, expect, it } from "vitest";
import { rpgKnowledgeCorpus } from "../src/modules/ai/knowledge-corpus.js";
import {
  availableRpgKnowledge,
  resolveRpgKnowledgeScope,
  rpgKnowledgeCorpusSchema,
  rpgKnowledgeEntrySchema,
  searchRpgKnowledge,
  searchRpgKnowledgeSchema,
} from "../src/modules/ai/knowledge.js";

describe("RPG knowledge retrieval", () => {
  it.each([
    ["преимущество", "dnd-2014-advantage-ru", "ru"],
    ["3 действия", "pf2-remaster-actions-ru", "ru"],
    ["аспекты", "fate-core-aspects-ru", "ru"],
    ["Какие правила создания преимущества в Fate?", "fate-core-four-actions-ru", "ru"],
    ["трудный успех", "cthulhu-7e-skills-ru", "ru"],
    ["advantage", "dnd-2014-advantage-en", "en"],
    ["three actions", "pf2-remaster-actions-en", "en"],
    ["aspects", "fate-core-aspects-en", "en"],
    ["hard success", "cthulhu-7e-skills-en", "en"],
  ] as const)("retrieves a cited answer for %s", (query, id, locale) => {
    const result = searchRpgKnowledge({ query, locale });
    expect(result[0].id).toBe(id);
    expect(result[0].source.url).toMatch(/^https:\/\//);
    expect(result[0].edition).toBeTruthy();
  });

  it.each([
    ["Как работает преимущество в D&D 5e 2014?", "dnd", "5e-2014", "dnd-2014-advantage-ru"],
    ["Сколько действий в Pathfinder 2e Remaster?", "pathfinder", "2e-remaster", "pf2-remaster-actions-ru"],
    ["Как задействовать аспект в Fate Core?", "fate", "core", "fate-core-aspects-ru"],
    ["Что такое трудный успех в Call of Cthulhu 7e?", "cthulhu", "7e", "cthulhu-7e-skills-ru"],
  ] as const)("answers the documented question %s in its exact edition", (query, systemId, edition, id) => {
    const result = searchRpgKnowledge({ query, systemId, edition, locale: "ru" });
    expect(result[0]?.id).toBe(id);
    expect(result.every((match) => match.systemId === systemId && match.edition === edition)).toBe(true);
  });

  it("keeps system and edition filters exact without falling back to another edition", () => {
    const result = searchRpgKnowledge({ query: "преимущество", systemId: "dnd", edition: "5e-2014" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((match) => match.systemId === "dnd" && match.edition === "5e-2014")).toBe(true);
    expect(searchRpgKnowledge({ query: "преимущество", systemId: "dnd", edition: "5e-2024" })).toEqual([]);
    expect(searchRpgKnowledge({ query: "advantage", systemId: "pathfinder", edition: "5e-2014" })).toEqual([]);
  });

  it("does not turn unrelated words, punctuation or partial phrases into evidence", () => {
    for (const query of [
      "quantum chromodynamics", "armor class", "я", "!!!", "абракадабра",
      "armor class in Dungeons and Dragons", "Dungeons and Dragons spell slots",
      "Как считается броня в Dungeons and Dragons?", "Pathfinder character level requirements",
      "правила квантовой пушки D&D 5e 2014", "спасбросок от смерти",
    ]) {
      expect(searchRpgKnowledge({ query, locale: "ru" })).toEqual([]);
    }
    expect(searchRpgKnowledge({
      query: "правила квантовой пушки D&D 5e 2014", systemId: "dnd", edition: "5e-2014",
    })).toEqual([]);
  });

  it("bounds query size, result count and reference text", () => {
    expect(searchRpgKnowledge({ query: "d20", limit: 1 })).toHaveLength(1);
    expect(searchRpgKnowledgeSchema.safeParse({ query: "x".repeat(401) }).success).toBe(false);
    expect(searchRpgKnowledgeSchema.safeParse({ query: "  " }).success).toBe(false);
    expect(searchRpgKnowledgeSchema.safeParse({ query: "d20", limit: 6 }).success).toBe(false);
    expect(searchRpgKnowledgeSchema.safeParse({ query: "d20", systemId: "gurps" }).success).toBe(false);
    expect(rpgKnowledgeEntrySchema.safeParse({ ...rpgKnowledgeCorpus[0], text: "x".repeat(2401) }).success).toBe(false);
  });

  it("validates citation URLs, unique IDs and both translations for every topic", () => {
    expect(rpgKnowledgeCorpusSchema.safeParse(rpgKnowledgeCorpus).success).toBe(true);
    expect(rpgKnowledgeCorpusSchema.safeParse([rpgKnowledgeCorpus[0], rpgKnowledgeCorpus[0]]).success).toBe(false);
    for (const url of ["javascript:alert(1)", "http://example.com", "https://user:secret@example.com"]) {
      expect(rpgKnowledgeEntrySchema.safeParse({
        ...rpgKnowledgeCorpus[0], source: { title: "Unsafe", url },
      }).success).toBe(false);
    }
    for (const entry of rpgKnowledgeCorpus) {
      const translatedId = entry.id.replace(/-(ru|en)$/, entry.locale === "ru" ? "-en" : "-ru");
      expect(rpgKnowledgeCorpus.find((candidate) => candidate.id === translatedId)).toMatchObject({
        systemId: entry.systemId, edition: entry.edition, source: entry.source,
      });
    }
    expect(availableRpgKnowledge()).toHaveLength(4);
  });

  it("only resolves an unambiguous named system and an explicitly known edition", () => {
    expect(resolveRpgKnowledgeScope({ title: "My campaign", family: "D&D", edition: "2014" }))
      .toEqual({ systemId: "dnd", edition: "5e-2014" });
    expect(resolveRpgKnowledgeScope({ title: "D&D", family: null, edition: "5e" }))
      .toEqual({ systemId: "dnd", edition: null });
    expect(resolveRpgKnowledgeScope({ title: "D&D", family: null, edition: "2024" }))
      .toEqual({ systemId: "dnd", edition: null });
    expect(resolveRpgKnowledgeScope({ title: "Fate Core", family: null, edition: null }))
      .toEqual({ systemId: "fate", edition: null });
    expect(resolveRpgKnowledgeScope({ title: "D&D house rules", family: null, edition: "2014" })).toBeNull();
    expect(resolveRpgKnowledgeScope({ title: "Fate", family: "D&D", edition: "2014" })).toBeNull();
  });
});
