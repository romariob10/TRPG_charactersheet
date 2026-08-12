import type { ExtractedCatalogField, TextToken } from "./catalog.js";

export type CatalogLanguage = "en" | "ru";

const russianExactNames: Record<string, string> = {
  armorclass: "Класс доспеха",
  characterclass: "Класс персонажа",
  charactername: "Имя персонажа",
  hitdice: "Кости хитов",
  hitpoints: "Хиты",
  playername: "Имя игрока",
  savingthrow: "Спасбросок",
  spellcastingability: "Базовая характеристика заклинаний",
};

const russianTechnicalTerms: Record<string, string> = {
  ac: "класс доспеха",
  alignment: "мировоззрение",
  armor: "броня",
  attack: "атака",
  background: "предыстория",
  bonus: "бонус",
  cha: "харизма",
  character: "персонаж",
  charisma: "харизма",
  class: "класс",
  con: "телосложение",
  constitution: "телосложение",
  damage: "урон",
  description: "описание",
  dex: "ловкость",
  dexterity: "ловкость",
  dice: "кости",
  equipment: "снаряжение",
  experience: "опыт",
  feature: "особенность",
  field: "поле",
  hit: "хиты",
  hp: "хиты",
  int: "интеллект",
  intelligence: "интеллект",
  inventory: "инвентарь",
  level: "уровень",
  name: "имя",
  notes: "заметки",
  player: "игрок",
  points: "очки",
  proficiency: "мастерство",
  race: "раса",
  saving: "спасбросок",
  speed: "скорость",
  spell: "заклинание",
  str: "сила",
  strength: "сила",
  throw: "бросок",
  trait: "черта",
  wis: "мудрость",
  wisdom: "мудрость",
  xp: "опыт",
};

const russianKindNames: Record<ExtractedCatalogField["kind"], string> = {
  button: "Кнопка",
  checkbox: "Флажок",
  dropdown: "Выпадающий список",
  list: "Список",
  multiline: "Многострочное поле",
  radio: "Переключатель",
  signature: "Подпись",
  text: "Текстовое поле",
  unknown: "Поле",
};

const englishKindNames: Record<ExtractedCatalogField["kind"], string> = {
  button: "Button",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
  list: "List",
  multiline: "Multiline field",
  radio: "Radio option",
  signature: "Signature",
  text: "Text field",
  unknown: "Field",
};

export function detectCatalogLanguage(
  tokens: readonly TextToken[],
): CatalogLanguage | null {
  const visibleText = tokens.map((token) => token.text).join(" ");
  const cyrillic = countMatches(visibleText, /[А-ЯЁа-яё]/g);
  const latin = countMatches(visibleText, /[A-Za-z]/g);
  const letters = cyrillic + latin;
  if (letters < 12) return null;

  if (cyrillic >= 8 && cyrillic / letters >= 0.18) return "ru";
  if (latin >= 12 && latin / letters >= 0.72) return "en";
  return null;
}

export function isCatalogTextInLanguage(
  text: string | null,
  language: CatalogLanguage,
): boolean {
  if (text === null || text.trim() === "") return true;
  const cyrillic = countMatches(text, /[А-ЯЁа-яё]/g);
  const latin = countMatches(text, /[A-Za-z]/g);
  if (cyrillic + latin === 0) return true;
  return language === "ru"
    ? cyrillic > 0 && latin === 0
    : latin > 0 && cyrillic === 0;
}

export function harmonizeCatalogLanguage(
  fields: readonly ExtractedCatalogField[],
  language: CatalogLanguage | null,
): ExtractedCatalogField[] {
  if (!language) return fields.map((field) => ({ ...field }));

  const pageSections = new Map<number, string>();
  for (const field of fields) {
    if (
      field.section &&
      isCatalogTextInLanguage(field.section, language) &&
      !pageSections.has(field.page)
    ) {
      pageSections.set(field.page, field.section.trim());
    }
  }

  const fallbackCounters = new Map<string, number>();
  return fields.map((field) => {
    const labelMatches = isCatalogTextInLanguage(field.label, language);
    const sectionMatches = isCatalogTextInLanguage(field.section, language);
    const localizedLabel = labelMatches
      ? null
      : localizeTechnicalName(field.pdfName, language);
    const fallbackKey = `${field.page}:${field.kind}`;
    const fallbackIndex = (fallbackCounters.get(fallbackKey) ?? 0) + 1;
    if (!labelMatches && !localizedLabel) {
      fallbackCounters.set(fallbackKey, fallbackIndex);
    }

    return {
      ...field,
      label: labelMatches
        ? field.label.trim()
        : localizedLabel ??
          `${language === "ru" ? russianKindNames[field.kind] : englishKindNames[field.kind]} ${fallbackIndex}`,
      section:
        field.section && sectionMatches
          ? field.section.trim()
          : (pageSections.get(field.page) ??
            (language === "ru" ? "Общее" : "General")),
      confidence: labelMatches
        ? field.confidence
        : Math.min(field.confidence, 0.35),
      source: labelMatches ? field.source : "heuristic",
    };
  });
}

function localizeTechnicalName(
  technicalName: string,
  language: CatalogLanguage,
): string | null {
  const compact = technicalName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (language === "ru" && russianExactNames[compact]) {
    return russianExactNames[compact];
  }

  const parts = technicalName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (parts.length === 0) return null;

  if (language === "en") {
    const readable = parts.join(" ").toLowerCase();
    return readable.charAt(0).toUpperCase() + readable.slice(1);
  }

  const translated = parts.map((part) => {
    if (/^\d+$/.test(part)) return part;
    return russianTechnicalTerms[part.toLowerCase()] ?? null;
  });
  if (translated.some((part) => part === null)) return null;
  const readable = translated.join(" ");
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

function countMatches(value: string, expression: RegExp): number {
  return value.match(expression)?.length ?? 0;
}
