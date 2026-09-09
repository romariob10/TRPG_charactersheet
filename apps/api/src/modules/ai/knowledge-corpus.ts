import type { RpgKnowledgeEntry } from "./knowledge.js";

type Translation = Pick<RpgKnowledgeEntry, "title" | "text" | "keywords">;

function bilingual(
  entry: Omit<RpgKnowledgeEntry, keyof Translation | "locale">,
  ru: Translation,
  en: Translation,
): RpgKnowledgeEntry[] {
  return [
    { ...entry, ...ru, id: `${entry.id}-ru`, locale: "ru" },
    { ...entry, ...en, id: `${entry.id}-en`, locale: "en" },
  ];
}

// Short original summaries checked against the linked sources on 2026-09-07.
// Keep editions explicit: these fragments are not a complete rulebook.
export const rpgKnowledgeCorpus: RpgKnowledgeEntry[] = [
  ...bilingual(
    {
      id: "dnd-2014-ability-checks", systemId: "dnd", systemName: "Dungeons & Dragons", edition: "5e-2014",
      source: { title: "D&D Basic Rules (2014): Using Ability Scores", url: "https://www.dndbeyond.com/sources/dnd/basic-rules-2014/using-ability-scores" },
    },
    {
      title: "Проверки характеристик и владение",
      text: "Для проверки характеристики в D&D 5e 2014 бросьте d20, прибавьте модификатор характеристики и применимые бонусы. Итог не ниже сложности означает успех. Владение подходящим навыком позволяет добавить бонус мастерства; один бонус мастерства не складывается сам с собой.",
      keywords: ["проверка", "характеристики", "навык", "владение", "мастерство", "сложность", "d20", "proficiency", "ability check"],
    },
    {
      title: "Ability checks and proficiency",
      text: "For a D&D 5e 2014 ability check, add the relevant ability modifier and applicable bonuses to a d20. Meeting the difficulty succeeds. Proficiency in a relevant skill adds the proficiency bonus; multiple reasons to add that same bonus do not stack it.",
      keywords: ["ability", "check", "skill", "proficiency", "difficulty", "dc", "d20", "проверка", "навык"],
    },
  ),
  ...bilingual(
    {
      id: "dnd-2014-advantage", systemId: "dnd", systemName: "Dungeons & Dragons", edition: "5e-2014",
      source: { title: "D&D Basic Rules (2014): Advantage and Disadvantage", url: "https://www.dndbeyond.com/sources/dnd/basic-rules-2014/using-ability-scores" },
    },
    {
      title: "Преимущество и помеха",
      text: "В D&D 5e 2014 преимущество означает выбор большего из двух d20, помеха — меньшего. Несколько источников не добавляют ещё кубики. Если одновременно есть преимущество и помеха, бросается один d20 независимо от количества источников с каждой стороны.",
      keywords: ["преимущество", "помеха", "два кубика", "advantage", "disadvantage", "d20"],
    },
    {
      title: "Advantage and disadvantage",
      text: "In D&D 5e 2014, advantage selects the higher of two d20 results; disadvantage selects the lower. Additional sources do not add dice. Having both cancels the effects and uses one d20, even when the numbers of sources differ.",
      keywords: ["advantage", "disadvantage", "cancel", "stack", "d20", "преимущество", "помеха"],
    },
  ),
  ...bilingual(
    {
      id: "dnd-2014-turn", systemId: "dnd", systemName: "Dungeons & Dragons", edition: "5e-2014",
      source: { title: "D&D Basic Rules (2014): Combat", url: "https://www.dndbeyond.com/sources/dnd/basic-rules-2014/combat" },
    },
    {
      title: "Ход, бонусное действие и реакция",
      text: "В обычный ход D&D 5e 2014 доступны движение в пределах скорости и действие. Бонусное действие возможно только благодаря конкретному правилу, максимум одно за ход. Реакция требует подходящего события; после её использования следующая доступна с начала вашего следующего хода.",
      keywords: ["ход", "бой", "движение", "действие", "бонусное", "реакция", "bonus action", "reaction"],
    },
    {
      title: "Turns, bonus actions and reactions",
      text: "A normal D&D 5e 2014 turn permits movement up to speed and an action. A specific rule must grant a bonus action option, limited to one per turn. A reaction needs its trigger; after using it, another becomes available at your next turn's start.",
      keywords: ["turn", "combat", "movement", "action", "bonus action", "reaction", "ход", "реакция"],
    },
  ),
  ...bilingual(
    {
      id: "pf2-remaster-actions", systemId: "pathfinder", systemName: "Pathfinder", edition: "2e-remaster",
      source: { title: "Pathfinder Player Core: Playing the Game", url: "https://2e.aonprd.com/Rules.aspx?ID=2263" },
    },
    {
      title: "Три действия и реакция",
      text: "В Pathfinder 2e Remaster в начале своего хода обычно восстанавливаются три действия и одна реакция. Активность расходует указанное число действий. Реакция требует своего триггера; состояния могут ограничивать доступные действия.",
      keywords: ["три действия", "действие", "ход", "реакция", "экономика действий", "actions", "reaction"],
    },
    {
      title: "Three actions and a reaction",
      text: "In Pathfinder 2e Remaster, your turn normally refreshes three actions and one reaction. Activities spend their stated action cost. Reactions require a trigger, and conditions can restrict your available actions.",
      keywords: ["three actions", "action economy", "turn", "reaction", "activity", "действия", "реакция"],
    },
  ),
  ...bilingual(
    {
      id: "pf2-remaster-degrees", systemId: "pathfinder", systemName: "Pathfinder", edition: "2e-remaster",
      source: { title: "Pathfinder Player Core: Playing the Game", url: "https://2e.aonprd.com/Rules.aspx?ID=2263" },
    },
    {
      title: "Степени успеха и критический результат",
      text: "В Pathfinder 2e Remaster результат от DC+10 даёт критический успех, а DC−10 и ниже — критический провал. Натуральная 20 улучшает степень на одну, натуральная 1 ухудшает на одну; они не гарантируют крайний исход.",
      keywords: ["степень", "успех", "критический", "провал", "натуральная", "dc", "critical", "natural 20"],
    },
    {
      title: "Degrees of success and critical results",
      text: "In Pathfinder 2e Remaster, DC+10 or higher is critical success; DC−10 or lower is critical failure. A natural 20 improves the degree once, and a natural 1 worsens it once, rather than guaranteeing either extreme.",
      keywords: ["degree", "success", "critical", "failure", "natural 20", "natural 1", "dc", "критический"],
    },
  ),
  ...bilingual(
    {
      id: "pf2-remaster-checks", systemId: "pathfinder", systemName: "Pathfinder", edition: "2e-remaster",
      source: { title: "Pathfinder Player Core: Rules Overview", url: "https://2e.aonprd.com/Rules.aspx?ID=2266" },
    },
    {
      title: "Проверки и сложность",
      text: "Базовая проверка Pathfinder 2e Remaster — d20 с подходящим модификатором, бонусами и штрафами. Сравните итог со сложностью DC. Результат не ниже DC успешен; конкретное действие определяет последствия каждой степени успеха.",
      keywords: ["проверка", "сложность", "модификатор", "бонус", "штраф", "d20", "dc", "check"],
    },
    {
      title: "Checks and difficulty classes",
      text: "A basic Pathfinder 2e Remaster check combines a d20 with the appropriate modifier, bonuses and penalties. Compare the total with the DC. Meeting it succeeds; the attempted action specifies the consequences for each degree of success.",
      keywords: ["check", "difficulty", "modifier", "bonus", "penalty", "dc", "d20", "проверка"],
    },
  ),
  ...bilingual(
    {
      id: "fate-core-dice", systemId: "fate", systemName: "Fate", edition: "core",
      source: { title: "Fate Core SRD: Actions & Outcomes", url: "https://fate-srd.com/fate-core/actions-outcomes" },
    },
    {
      title: "Кубики Fate и навык",
      text: "Когда интересное препятствие требует броска в Fate Core, выберите подходящий навык и бросьте четыре кубика Fate. Каждый даёт −1, 0 или +1. Сумма кубиков плюс рейтинг навыка определяет результат, который сравнивается с противодействием.",
      keywords: ["кубики", "бросок", "навык", "4df", "fudge", "dice", "skill", "противодействие"],
    },
    {
      title: "Fate dice and skill rolls",
      text: "When interesting opposition calls for a Fate Core roll, select a suitable skill and roll four Fate dice. Each contributes −1, 0 or +1. Add their sum to the skill rating and compare the resulting total with the opposition.",
      keywords: ["dice", "roll", "skill", "4df", "fudge", "opposition", "кубики", "навык"],
    },
  ),
  ...bilingual(
    {
      id: "fate-core-four-actions", systemId: "fate", systemName: "Fate", edition: "core",
      source: { title: "Fate Core SRD: Four Actions", url: "https://fate-srd.com/fate-core/four-actions" },
    },
    {
      title: "Четыре типа действий",
      text: "Fate Core различает преодоление препятствия, создание преимущества, атаку и защиту. Выбор зависит от намерения персонажа и ситуации. Это типы применения навыков, а не запас из четырёх действий на ход; описание навыка уточняет доступные применения.",
      keywords: ["четыре действия", "преодоление", "преимущество", "создания преимущества", "атака", "защита", "overcome", "create advantage", "attack", "defend"],
    },
    {
      title: "Four action types",
      text: "Fate Core separates overcoming an obstacle, creating an advantage, attacking and defending. Choose according to the character's intent and situation. These are skill uses, not a four-action turn allowance; each skill's description identifies which uses fit.",
      keywords: ["four actions", "overcome", "create advantage", "attack", "defend", "преодоление", "атака", "защита"],
    },
  ),
  ...bilingual(
    {
      id: "fate-core-aspects", systemId: "fate", systemName: "Fate", edition: "core",
      source: { title: "Fate Core SRD: Fate Points", url: "https://fate-srd.com/fate-core/fate-points" },
    },
    {
      title: "Аспекты и жетоны судьбы",
      text: "В Fate Core подходящий аспект можно задействовать за жетон судьбы, чтобы получить +2 или перебросить кубики. Принятие осложнения, связанного с аспектом, приносит жетон; отказ от предложенного осложнения обычно требует потратить жетон.",
      keywords: ["аспект", "жетон", "судьбы", "осложнение", "переброс", "aspect", "invoke", "compel", "fate point"],
    },
    {
      title: "Aspects and fate points",
      text: "In Fate Core, invoking a relevant aspect with a fate point can give +2 or a dice reroll. Accepting an aspect-related complication earns a point; refusing the proposed complication normally costs a point.",
      keywords: ["aspect", "invoke", "compel", "fate point", "reroll", "complication", "аспект", "жетон"],
    },
  ),
  ...bilingual(
    {
      id: "cthulhu-7e-skills", systemId: "cthulhu", systemName: "Call of Cthulhu", edition: "7e",
      source: { title: "Chaosium: Skill Rolls and Difficulty Levels", url: "https://cthulhuwiki.chaosium.com/rules/skill-rolls-and-difficulty-levels.html" },
    },
    {
      title: "Процентные проверки и уровни успеха",
      text: "В Call of Cthulhu 7e обычный успех требует d100 не выше навыка. Для трудного успеха предел равен половине навыка, для экстремального — одной пятой. Нужный уровень сложности задаёт Хранитель; меньший результат кубиков обычно лучше.",
      keywords: ["процент", "проверка", "навык", "трудный", "экстремальный", "успех", "d100", "hard", "extreme"],
    },
    {
      title: "Percentile checks and success levels",
      text: "In Call of Cthulhu 7e, regular success needs d100 no higher than the skill. Hard success uses half the skill as the ceiling; extreme success uses one-fifth. The Keeper sets the required difficulty, with lower dice results generally better.",
      keywords: ["percentile", "check", "skill", "regular", "hard", "extreme", "success", "d100", "навык"],
    },
  ),
  ...bilingual(
    {
      id: "cthulhu-7e-pushing", systemId: "cthulhu", systemName: "Call of Cthulhu", edition: "7e",
      source: { title: "Chaosium: Skill Rolls and Difficulty Levels", url: "https://cthulhuwiki.chaosium.com/rules/skill-rolls-and-difficulty-levels.html" },
    },
    {
      title: "Повторная попытка с повышенными ставками",
      text: "В Call of Cthulhu 7e проваленную проверку навыка иногда можно повторить как pushed roll, обосновав новые усилия действиями сыщика. Это не бесплатный переброс: повторный провал позволяет Хранителю назначить серьёзные последствия.",
      keywords: ["повтор", "повторная попытка", "форсирование", "переброс", "риск", "push", "pushed roll"],
    },
    {
      title: "Pushing a failed skill roll",
      text: "Call of Cthulhu 7e sometimes allows a failed skill check to be pushed when the investigator's actions justify renewed effort. This is not a free reroll: another failure lets the Keeper impose a severe consequence.",
      keywords: ["push", "pushed roll", "reroll", "failed", "risk", "consequence", "форсирование", "переброс"],
    },
  ),
  ...bilingual(
    {
      id: "cthulhu-7e-bonus-dice", systemId: "cthulhu", systemName: "Call of Cthulhu", edition: "7e",
      source: { title: "Chaosium: The Game System", url: "https://cthulhuwiki.chaosium.com/rules/game-system.html" },
    },
    {
      title: "Бонусные и штрафные кубики",
      text: "В Call of Cthulhu 7e бонусный или штрафной кубик добавляет ещё один кубик десятков к процентному броску; кубик единиц остаётся общим. При бонусе выбирают комбинацию с меньшим итогом, при штрафе — с большим.",
      keywords: ["бонусный", "штрафной", "кубик", "десятки", "процент", "bonus die", "penalty die", "d100"],
    },
    {
      title: "Bonus and penalty dice",
      text: "In Call of Cthulhu 7e, a bonus or penalty die adds another tens die to the percentile roll while sharing the units die. A bonus selects the lower resulting combination; a penalty selects the higher one.",
      keywords: ["bonus", "penalty", "dice", "tens", "percentile", "d100", "бонусный", "штрафной"],
    },
  ),
];
