import {
  defaultBoxProps, targetLayoutMapSchema, sheetFieldDefinitionSchema,
  type BoxProps, type FrameNode, type LayoutNode, type SheetFieldDefinition,
} from "@mycharacter/contracts";

export const dnd5eLabelKeys = [
  "characterName",
  "classLevel",
  "background",
  "playerName",
  "race",
  "alignment",
  "experience",
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
  "score",
  "modifier",
  "inspiration",
  "proficiencyBonus",
  "savingThrows",
  "skills",
  "proficient",
  "acrobatics",
  "athletics",
  "perception",
  "survival",
  "performance",
  "intimidation",
  "history",
  "sleightOfHand",
  "arcana",
  "medicine",
  "deception",
  "nature",
  "insight",
  "investigation",
  "religion",
  "stealth",
  "persuasion",
  "animalHandling",
  "passivePerception",
  "languages",
  "armorClass",
  "initiative",
  "speed",
  "hitPointsMax",
  "hitPointsCurrent",
  "hitPointsTemporary",
  "hitDice",
  "hitDiceTotal",
  "deathSaves",
  "successes",
  "failures",
  "attacks",
  "attackName",
  "attackBonus",
  "attackDamage",
  "attackNotes",
  "equipment",
  "copper",
  "silver",
  "electrum",
  "gold",
  "platinum",
  "personality",
  "ideals",
  "bonds",
  "flaws",
  "features",
  "age",
  "height",
  "weight",
  "eyes",
  "skin",
  "hair",
  "appearance",
  "allies",
  "organization",
  "symbol",
  "backstory",
  "additionalFeatures",
  "treasure",
  "spellcastingClass",
  "spellcastingAbility",
  "spellSaveDc",
  "spellAttackBonus",
  "cantrips",
  "spellLevel",
  "spellName",
  "prepared",
  "slotsTotal",
  "slotsUsed"
] as const;
export type Dnd5eLabels = Record<(typeof dnd5eLabelKeys)[number], string>;

/** Native 2014 sheet: the reference PDF supplies the composition, not a background. */
export function createDnd5ePreset(labels: Dnd5eLabels) {
  const fields: SheetFieldDefinition[] = [];
  const box = (props: Partial<BoxProps> = {}): BoxProps => ({ ...structuredClone(defaultBoxProps), ...props });
  const frame = (name: string, children: LayoutNode[], props: Partial<BoxProps> = {}, direction: FrameNode["direction"] = "vertical", gap = 4): FrameNode => ({
    id: crypto.randomUUID(), kind: "frame", name, box: box(props), direction, gap,
    align: "stretch", justify: "start", wrap: false, collapseAdjacentStrokes: false, children,
  });
  const text = (value: string, fontSize = 7, props: Partial<BoxProps> = {}): LayoutNode => ({
    id: crypto.randomUUID(), kind: "text", name: value, text: value, variant: "label",
    fontFamily: "Noto Sans", fontSize, align: "center", weight: "bold", uppercase: false,
    color: "ink", lineHeight: 1.15, box: box(props),
  });
  const field = (key: string, label: string, kind: SheetFieldDefinition["kind"] = "text", props: Partial<BoxProps> = {}): LayoutNode => {
    fields.push(sheetFieldDefinitionSchema.parse({ id: crypto.randomUUID(), key, label, kind,
      defaultValue: kind === "number" ? 0 : kind === "checkbox" ? false : "" }));
    const base = { id: crypto.randomUUID(), name: label, fieldBinding: key, label: "", placeholder: "",
      readOnly: false, box: box({ height: { mode: "fixed", value: 18 }, strokeColor: "ink", ...props }) };
    if (kind === "number") return { ...base, kind: "number-input", variant: "plain", step: 1, showSign: false };
    if (kind === "checkbox") return { ...base, kind: "checkbox", shape: "circle", showBorder: true };
    if (kind === "avatar") return { ...base, kind: "image", url: "", alt: label, fit: "cover", aspectRatio: "3:4" };
    if (kind === "multiline") return { ...base, kind: "textarea", rows: 1, variant: "plain" };
    return { ...base, kind: "field-input", variant: "underline" };
  };
  const control = (key: string, label: string, kind: SheetFieldDefinition["kind"] = "text", height = 34, caption = label) => frame(label,
    [field(key, label, kind, { height: { mode: "fill" } }), text(caption)], { height: { mode: "fixed", value: height } }, "vertical", 0);
  const panel = (label: string, height: number, children: LayoutNode[]) => frame(label, [...children, text(label)], {
    height: { mode: "fixed", value: height }, padding: { top: 8, right: 8, bottom: 6, left: 8 }, fill: "surface",
    strokeColor: "ink", strokeWidth: { top: 1, right: 1, bottom: 1, left: 1 },
    cornerRadius: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
  }, "vertical", 0);
  const prose = (key: string, label: string, height: number) => panel(label, height, [field(key, label, "multiline", { height: { mode: "fill" } })]);
  const row = (name: string, children: LayoutNode[], gap = 6) => frame(name, children, {}, "horizontal", gap);
  const abilities = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
  const skills = ["acrobatics", "athletics", "perception", "survival", "performance", "intimidation", "history", "sleightOfHand", "arcana", "medicine", "deception", "nature", "insight", "investigation", "religion", "stealth", "persuasion", "animalHandling"] as const;
  const skillAbilities = [1, 0, 4, 4, 5, 5, 3, 1, 3, 4, 5, 3, 4, 3, 3, 1, 5, 4];
  const trainedRow = (key: string, label: string, suffix = "") => {
    const node = row(label, [
      field(`${key}_proficient`, `${label} / ${labels.proficient}`, "checkbox", { width: { mode: "fixed", value: 10 }, height: { mode: "fill" } }),
      field(`${key}_bonus`, label, "text", { width: { mode: "fixed", value: 22 }, height: { mode: "fill" } }),
      text(`${label}${suffix}`, 6, { height: { mode: "fill" } }),
    ], 3);
    node.box.height = { mode: "fixed", value: 19 };
    const title = node.children[2];
    if (title.kind === "text") title.align = "left";
    return node;
  };
  const header = row(labels.characterName, [
    panel(labels.characterName, 72, [field("character_name", labels.characterName, "text", { height: { mode: "fill" } })]),
    frame(labels.classLevel, [
      row(labels.classLevel, [control("class_level", labels.classLevel), control("background", labels.background), control("player_name", labels.playerName)]),
      row(labels.race, [control("race", labels.race), control("alignment", labels.alignment), control("experience", labels.experience, "number")]),
    ]),
  ]);
  header.children[0].box.width = { mode: "fixed", value: 190 };
  const scores = frame(labels.score, abilities.map(ability => panel(labels[ability], 77, [
    field(ability, `${labels[ability]} / ${labels.score}`, "number", { height: { mode: "fill" } }),
    field(`${ability}_modifier`, `${labels[ability]} / ${labels.modifier}`, "text", { height: { mode: "fixed", value: 18 } }),
  ])), { width: { mode: "fixed", value: 60 } }, "vertical", 7);
  const checks = frame(labels.skills, [
    row(labels.inspiration, [field("inspiration", labels.inspiration, "checkbox", { width: { mode: "fixed", value: 16 } }), text(labels.inspiration, 7)]),
    control("proficiency_bonus", labels.proficiencyBonus, "text", 28),
    panel(labels.savingThrows, 136, abilities.map(ability => trainedRow(`save_${ability}`, labels[ability]))),
    panel(labels.skills, 365, skills.map((skill, index) => trainedRow(`skill_${skill}`, labels[skill], ` (${labels[abilities[skillAbilities[index]]].slice(0, 3)})`))),
  ], {}, "vertical", 6);
  const left = frame(labels.skills, [row(labels.skills, [scores, checks], 6), control("passive_perception", labels.passivePerception, "number", 35), prose("languages", labels.languages, 80)], {}, "vertical", 9);
  left.box.width = { mode: "fixed", value: 184 };
  const deathRow = (key: string, label: string) => {
    const node = row(label, [text(label, 6, { width: { mode: "fixed", value: 32 } }), ...Array.from({ length: 3 }, (_, index) => field(`${key}_${index + 1}`, `${label} ${index + 1}`, "checkbox", { width: { mode: "fixed", value: 9 }, height: { mode: "fixed", value: 9 } }))], 3);
    node.box.height = { mode: "fixed", value: 18 };
    return node;
  };
  const attacks = panel(labels.attacks, 202, [
    row(labels.attacks, [text(labels.attackName, 6), text(labels.attackBonus, 6), text(labels.attackDamage, 6)], 3),
    ...Array.from({ length: 3 }, (_, index) => row(`${labels.attacks} ${index + 1}`, [
      field(`attack_${index + 1}_name`, `${labels.attackName} ${index + 1}`),
      field(`attack_${index + 1}_bonus`, `${labels.attackBonus} ${index + 1}`),
      field(`attack_${index + 1}_damage`, `${labels.attackDamage} ${index + 1}`),
    ], 3)),
    field("attack_notes", labels.attackNotes, "multiline", { height: { mode: "fill" } }),
  ]);
  const currency = ["copper", "silver", "electrum", "gold", "platinum"] as const;
  const middle = frame(labels.hitPointsCurrent, [
    row(labels.armorClass, [control("armor_class", labels.armorClass, "number", 52), control("initiative", labels.initiative, "text", 52), control("speed", labels.speed, "text", 52)]),
    panel(labels.hitPointsCurrent, 90, [control("hit_points_max", labels.hitPointsMax, "number", 26), field("hit_points_current", labels.hitPointsCurrent, "number", { height: { mode: "fill" } })]),
    panel(labels.hitPointsTemporary, 62, [field("hit_points_temporary", labels.hitPointsTemporary, "number", { height: { mode: "fill" } })]),
    row(labels.hitDice, [panel(labels.hitDice, 69, [control("hit_dice_total", labels.hitDiceTotal, "text", 22), field("hit_dice", labels.hitDice)]), panel(labels.deathSaves, 69, [deathRow("death_success", labels.successes), deathRow("death_failure", labels.failures)])]),
    attacks,
    panel(labels.equipment, 180, [row(labels.equipment, [frame(labels.gold, currency.map(key => control(key, labels[key], "number", 28)), { width: { mode: "fixed", value: 30 } }), field("equipment", labels.equipment, "multiline", { height: { mode: "fill" } })], 6)]),
  ], {}, "vertical", 9);
  const right = frame(labels.features, [prose("personality", labels.personality, 112), prose("ideals", labels.ideals, 84), prose("bonds", labels.bonds, 84), prose("flaws", labels.flaws, 84), prose("features", labels.features, 300)], {}, "vertical", 9);
  const columns = row(labels.features, [left, middle, right], 10);
  const bioHeader = row(labels.characterName, [control("character_name", labels.characterName, "text", 66), frame(labels.age, [
    row(labels.age, [control("age", labels.age), control("height", labels.height), control("weight", labels.weight)]),
    row(labels.eyes, [control("eyes", labels.eyes), control("skin", labels.skin), control("hair", labels.hair)]),
  ])]);
  // Repeated name refers to one semantic field across all pages.
  fields.splice(fields.findLastIndex(item => item.key === "character_name"), 1);
  bioHeader.children[0].box.width = { mode: "fixed", value: 190 };
  const bio = row(labels.backstory, [
    frame(labels.appearance, [panel(labels.appearance, 269, [field("portrait", labels.appearance, "avatar", { height: { mode: "fill" } })]), prose("backstory", labels.backstory, 431)], { width: { mode: "fixed", value: 184 } }, "vertical", 12),
    frame(labels.allies, [panel(labels.allies, 269, [control("organization", labels.organization, "text", 34), row(labels.allies, [field("allies", labels.allies, "multiline", { height: { mode: "fill" } }), field("organization_symbol", labels.symbol, "avatar", { width: { mode: "fixed", value: 140 }, height: { mode: "fill" } })])]), prose("additional_features", labels.additionalFeatures, 263), prose("treasure", labels.treasure, 156)], {}, "vertical", 12),
  ], 12);
  const spellHeader = row(labels.spellcastingClass, [control("spellcasting_class", labels.spellcastingClass, "text", 65), control("spellcasting_ability", labels.spellcastingAbility, "text", 65), control("spell_save_dc", labels.spellSaveDc, "number", 65), control("spell_attack_bonus", labels.spellAttackBonus, "text", 65)]);
  const counts = [8, 12, 13, 13, 13, 9, 9, 9, 7, 7];
  const spellLevel = (level: number) => {
    const label = level === 0 ? labels.cantrips : `${labels.spellLevel} ${level}`;
    const bindings = Array.from({ length: counts[level] }, (_, index) => `spell_${level}_${index + 1}`);
    bindings.forEach((key, index) => field(key, `${label} / ${labels.spellName} ${index + 1}`));
    const list = field(`spell_${level}_items`, label, "multiline", { height: { mode: "fill" } });
    if (list.kind !== "textarea") throw new Error("Expected a spell list");
    list.listStyle = "lined"; list.itemCount = counts[level]; list.itemBindings = bindings;
    list.itemLabels = bindings.map((_, index) => `${label} / ${labels.spellName} ${index + 1}`);
    list.allowItemCountChange = false;
    if (level > 0) {
      list.itemCheckboxBindings = bindings.map((_, index) => `spell_${level}_${index + 1}_prepared`);
      list.itemCheckboxBindings.forEach((key, index) => field(key, `${label} / ${labels.prepared} ${index + 1}`, "checkbox"));
    }
    const spellRows = frame(label, [list], { height: { mode: "fixed", value: counts[level] * 16 } }, "vertical", 0);
    return frame(label, [row(label, level === 0 ? [text(label, 9)] : [text(String(level), 14), control(`spell_slots_${level}_total`, `${labels.slotsTotal} / ${labels.spellLevel} ${level}`, "number", 28, labels.slotsTotal), control(`spell_slots_${level}_used`, `${labels.slotsUsed} / ${labels.spellLevel} ${level}`, "number", 28, labels.slotsUsed)]), spellRows], {}, "vertical", 5);
  };
  const spells = row(labels.spellName, [[0, 1, 2], [3, 4, 5], [6, 7, 8, 9]].map(levels => frame(labels.spellName, levels.map(spellLevel), {}, "vertical", 12)), 14);
  const page = (name: string, children: LayoutNode[]) => frame(name, children, {
    width: { mode: "fill" }, height: { mode: "hug" }, minHeight: 842,
    padding: { top: 24, right: 20, bottom: 24, left: 20 }, fill: "surface",
  }, "vertical", 14);
  const desktop = frame("D&D 5e", [page("D&D 5e / 1", [header, columns]), page("D&D 5e / 2", [bioHeader, bio]), page("D&D 5e / 3", [spellHeader, spells])], { width: { mode: "fixed", value: 595 }, fill: "surface" }, "vertical", 18);
  const print = structuredClone(desktop);
  print.gap = 0;
  print.box.height = { mode: "fixed", value: 842 * 3 };
  for (const node of print.children) if (node.kind === "frame") { node.printAsPage = true; node.box.height = { mode: "fixed", value: 842 }; }
  const mobile = structuredClone(desktop);
  mobile.box.width = { mode: "fill" };
  const adapt = (node: LayoutNode) => {
    if (node.kind === "text") { node.fontSize = Math.max(10, node.fontSize ?? 10); return; }
    if (node.kind !== "frame") return;
    if (node.id === left.children[0].id) { node.direction = "vertical"; node.gap = 12; }
    if (node.id === scores.id) { node.direction = "horizontal"; node.wrap = true; for (const child of node.children) child.box.minWidth = 90; }
    node.box.width = { mode: "fill" };
    node.box.minHeight = undefined;
    if (node.direction === "horizontal" && [header.id, bioHeader.id, columns.id, bio.id, spells.id, spellHeader.id].includes(node.id)) { node.direction = "vertical"; node.gap = 14; }
    if (node.id === header.children[1].id || node.id === bioHeader.children[1].id) for (const child of node.children) if (child.kind === "frame") { child.direction = "vertical"; child.gap = 6; }
    node.children.forEach(adapt);
  };
  mobile.children.forEach(adapt);
  // Keep compact numeric and checkbox columns; only the main desktop columns stack.
  const restoreWidths = (source: LayoutNode, target: LayoutNode) => {
    if (source.kind !== "frame" || target.kind !== "frame") return;
    const stacked = target.direction !== source.direction;
    target.children.forEach((child, index) => {
      const original = source.children[index];
      if (!stacked && original.box.width.mode === "fixed") child.box.width = structuredClone(original.box.width);
      restoreWidths(original, child);
    });
  };
  restoreWidths(desktop, mobile);
  for (const node of mobile.children) node.box.padding = { top: 16, right: 12, bottom: 16, left: 12 };
  return { layouts: targetLayoutMapSchema.parse({ desktop, tablet: structuredClone(mobile), mobile, print }), fields };
}
