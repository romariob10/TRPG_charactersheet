import { z } from "zod";
import { rpgKnowledgeCorpus } from "./knowledge-corpus.js";

export const rpgSystemIdSchema = z.enum(["dnd", "pathfinder", "fate", "cthulhu"]);

export const rpgKnowledgeEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/),
  systemId: rpgSystemIdSchema,
  systemName: z.string().trim().min(1).max(160),
  edition: z.string().trim().min(1).max(120),
  locale: z.enum(["ru", "en"]),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(2400),
  keywords: z.array(z.string().trim().min(1).max(100)).max(30),
  source: z.object({
    title: z.string().trim().min(1).max(200),
    url: z.string().url().max(1000).refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    }, "Sources must use HTTPS without credentials"),
  }).strict(),
}).strict();

export type RpgKnowledgeEntry = z.infer<typeof rpgKnowledgeEntrySchema>;

export const rpgKnowledgeCorpusSchema = z.array(rpgKnowledgeEntrySchema)
  .min(1).max(1000)
  .refine((entries) => new Set(entries.map((entry) => entry.id)).size === entries.length,
    "Knowledge entry IDs must be unique");

export const searchRpgKnowledgeSchema = z.object({
  query: z.string().trim().min(1).max(400),
  scope: z.enum(["character", "all"]).optional(),
  systemId: rpgSystemIdSchema.optional(),
  edition: z.string().trim().min(1).max(120).optional(),
  locale: z.enum(["ru", "en"]).optional(),
  limit: z.number().int().min(1).max(5).optional(),
}).strict();

export type SearchRpgKnowledgeInput = z.infer<typeof searchRpgKnowledgeSchema>;

const entries = rpgKnowledgeCorpusSchema.parse(rpgKnowledgeCorpus);
const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "do", "does", "for", "how", "i", "in", "is",
  "it", "of", "on", "or", "the", "to", "what", "with", "you", "your", "rule", "rules", "system",
  "а", "без", "в", "во", "для", "и", "из", "или", "к", "как", "на", "о", "об", "по", "с",
  "со", "у", "что", "это", "я", "мне", "мой", "работает", "правило", "правила", "система",
  "character", "characters", "персонаж", "персонажа", "считается", "сколько", "many", "get",
]);

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// System names and edition numbers are filters, not evidence about a rule.
const metadataTerms = new Set([
  ...entries.flatMap((entry) => normalize(`${entry.systemId} ${entry.systemName} ${entry.edition}`).split(/\s+/)),
  "d", "pf2e", "coc", "ктулху", "зов", "подземелья", "драконы", "фейт", "кор", "нри", "rpg",
  "ремастер", "2014", "2024", "5e", "2e", "7e", "srd", "edition", "редакция",
]);

function tokenize(value: string): string[] {
  return normalize(value).split(/\s+/).filter((token) =>
    token && !stopWords.has(token) && !metadataTerms.has(token))
    .map((token) => ["three", "три"].includes(token) ? "3"
      : ["four", "четыре"].includes(token) ? "4" : token);
}

const index = entries.map((entry) => ({
  entry,
  title: new Set(tokenize(entry.title)),
  keywords: new Set(tokenize(entry.keywords.join(" "))),
  text: new Set(tokenize(entry.text)),
}));

function containsTerm(tokens: Set<string>, term: string): boolean {
  if (tokens.has(term)) return true;
  // Small RU inflection tolerance; short abbreviations such as AC stay exact.
  return term.length >= 5 && [...tokens].some((token) =>
    token.length >= 5 && (token.startsWith(term) || term.startsWith(token)));
}

export function searchRpgKnowledge(rawInput: SearchRpgKnowledgeInput) {
  const input = searchRpgKnowledgeSchema.parse(rawInput);
  const terms = [...new Set(tokenize(input.query))].slice(0, 40);
  if (!terms.length) return [];

  return index
    .filter(({ entry }) => !input.systemId || entry.systemId === input.systemId)
    .filter(({ entry }) => !input.edition || entry.edition === input.edition)
    .map(({ entry, title, keywords, text }) => {
      let score = 0;
      let matched = 0;
      for (const term of terms) {
        const weight = containsTerm(title, term) ? 3
          : containsTerm(keywords, term) ? 2
            : containsTerm(text, term) ? 1 : 0;
        score += weight;
        if (weight) matched += 1;
      }
      // Locale only breaks relevant ties; it can never turn a miss into a hit.
      return { entry, score: score / (terms.length * 3), matched };
    })
    .filter((match) => match.matched >= Math.min(2, terms.length) && match.score >= 0.12)
    .sort((left, right) => right.score - left.score ||
      Number(right.entry.locale === input.locale) - Number(left.entry.locale === input.locale) ||
      left.entry.id.localeCompare(right.entry.id))
    .slice(0, input.limit ?? 4)
    .map(({ entry, score }) => ({ ...entry, score }));
}

export function availableRpgKnowledge() {
  return [...new Map(entries.map((entry) => [
    `${entry.systemId}:${entry.edition}`,
    { systemId: entry.systemId, systemName: entry.systemName, edition: entry.edition },
  ])).values()];
}

const systemAliases: Record<z.infer<typeof rpgSystemIdSchema>, string[]> = {
  dnd: ["dnd", "d&d", "dungeons and dragons", "dungeons & dragons", "подземелья и драконы"],
  pathfinder: ["pathfinder", "pathfinder 2e", "pf2e", "pathfinder second edition"],
  fate: ["fate", "fate core", "фейт", "фейт кор"],
  cthulhu: ["call of cthulhu", "cthulhu", "coc", "зов ктулху"],
};

const editionAliases: Record<z.infer<typeof rpgSystemIdSchema>, Record<string, string[]>> = {
  dnd: { "5e-2014": ["5e-2014", "5e 2014", "2014", "5.1", "srd 5.1"] },
  pathfinder: { "2e-remaster": ["2e-remaster", "2e remaster", "remaster", "ремастер"] },
  fate: { core: ["core", "fate core", "фейт кор"] },
  cthulhu: { "7e": ["7e", "7", "7th edition", "7 edition", "7 редакция"] },
};

export function resolveRpgKnowledgeEdition(
  systemId: z.infer<typeof rpgSystemIdSchema>,
  edition: string,
) {
  return Object.entries(editionAliases[systemId]).find(([, aliases]) =>
    aliases.some((alias) => normalize(alias) === normalize(edition)))?.[0] ?? null;
}

export function resolveRpgKnowledgeScope(system: {
  title: string;
  family: string | null;
  edition: string | null;
}) {
  const names = [system.family, system.title].filter((name): name is string => Boolean(name));
  const systems = Object.entries(systemAliases).filter(([, aliases]) =>
    names.some((name) => aliases.some((alias) => normalize(alias) === normalize(name))));
  if (systems.length !== 1) return null;
  const systemId = rpgSystemIdSchema.parse(systems[0][0]);
  const edition = system.edition ? resolveRpgKnowledgeEdition(systemId, system.edition) : null;
  return { systemId, edition };
}
