import {
  defaultBoxProps,
  targetLayoutMapSchema,
  sheetFieldDefinitionSchema,
  type BoxProps,
  type FrameNode,
  type LayoutNode,
  type SheetFieldDefinition,
} from "@mycharacter/contracts";
export const fateCoreLabelKeys = [
  "characterName",
  "fatePoints",
  "description",
  "aspects",
  "consequences",
  "physical",
  "mental",
  "portrait",
  "stunts",
  "extras",
  "skills",
  "highConcept",
  "trouble",
  "mildConsequence",
  "moderateConsequence",
  "severeConsequence",
  "physicalStress",
  "mentalStress",
  "skill",
] as const;
export type FateCoreLabels = Record<(typeof fateCoreLabelKeys)[number], string>;
/** A4 composition from the supplied Fate sheet; every control remains a builder node. */
export function createFateCorePreset(labels: FateCoreLabels) {
  const fields: SheetFieldDefinition[] = [];
  const box = (props: Partial<BoxProps> = {}): BoxProps => ({
    ...structuredClone(defaultBoxProps),
    ...props,
  });
  const frame = (
    name: string,
    children: LayoutNode[],
    props: Partial<BoxProps> = {},
    direction: FrameNode["direction"] = "vertical",
    gap = 0,
  ): FrameNode => ({
    id: crypto.randomUUID(),
    name,
    kind: "frame",
    direction,
    gap,
    align: "stretch",
    justify: "start",
    wrap: false,
    collapseAdjacentStrokes: false,
    ornamentStyle: "none",
    titleDock: { dock: "none", variant: "none" },
    footerDock: { dock: "none", variant: "none" },
    box: box(props),
    children,
  });
  const field = (
    key: string,
    label: string,
    kind: SheetFieldDefinition["kind"],
    props: Partial<BoxProps> = {},
    variant: "plain" | "underline" = "plain",
  ): LayoutNode => {
    fields.push(
      sheetFieldDefinitionSchema.parse({
        id: crypto.randomUUID(),
        key,
        label,
        kind,
        defaultValue: kind === "number" ? 0 : kind === "checkbox" ? false : "",
      }),
    );
    const base = {
      id: crypto.randomUUID(),
      name: label,
      fieldBinding: key,
      label: "",
      placeholder: "",
      readOnly: false,
      box: box({ strokeColor: "ink", ...props }),
    };
    if (kind === "avatar")
      return {
        ...base,
        kind: "image",
        url: "",
        alt: label,
        fit: "cover",
        box: box({ fill: "surface", ...props }),
      };
    if (kind === "checkbox")
      return {
        ...base,
        kind: "checkbox",
        label: key.split("_").at(-1)!,
        shape: "arc",
      };
    if (kind === "number")
      return {
        ...base,
        kind: "number-input",
        variant: "plain",
        min: 0,
        step: 1,
        showSign: false,
      };
    if (kind === "multiline")
      return { ...base, kind: "textarea", rows: 1, variant };
    return { ...base, kind: "field-input", variant };
  };
  const panel = (
    label: string,
    height: number,
    children: LayoutNode[],
    centered = false,
  ) => {
    const node = frame(label, children, {
      height: { mode: "fixed", value: height },
      strokeWidth: { top: 1, right: 1, bottom: 1, left: 1 },
      strokeColor: "ink",
      padding: { top: 12, right: 12, bottom: 8, left: 12 },
      fill: "surface",
    });
    node.cornerOrnaments = {
      preset: "fate-turnback",
      topLeft: true,
      topRight: true,
      bottomLeft: true,
      bottomRight: true,
    };
    node.topOrnament = {
      preset: "fate",
      align: centered ? "center" : "start",
      offset: 0,
      text: label.toLowerCase(),
      fontFamily: "Montserrat Alternates",
      fontSize: 10,
      fontWeight: "medium",
      letterSpacingPx: -0.9,
    };
    return node;
  };
  const multilinePanel = (key: string, label: string, height: number) =>
    panel(label, height, [
      field(key, label, "multiline", { height: { mode: "fill" } }),
    ]);
  const lines = (key: string, label: string, count: number, height: number, fieldLabels: string[] = []) => {
    const bindings = Array.from({ length: count }, (_, index) => `${key}_${index + 1}`);
    bindings.forEach((binding, index) => field(binding, fieldLabels[index] || `${label} ${index + 1}`, "multiline"));
    const list = field(`${key}_items`, label, "multiline", { height: { mode: "fill" } });
    if (list.kind !== "textarea") throw new Error("Expected a multiline list");
    const node = panel(label, height, [{ ...list, listStyle: "lined", itemCount: count,
      itemBindings: bindings, itemLabels: bindings.map((_, index) => fieldLabels[index] || `${label} ${index + 1}`), allowItemCountChange: false }]);
    node.gap = 6;
    node.box.padding = { top: 6, right: 20, bottom: 8, left: 20 };
    return node;
  };
  const stress = (key: string, label: string) =>
    panel(label, 46, [
      frame(
        label,
        Array.from({ length: 4 }, (_, i) =>
          field(`${key}_${i + 1}`, `${key === "physical_stress" ? labels.physicalStress : labels.mentalStress} ${i + 1}`, "checkbox"),
        ),
        {},
        "horizontal",
        8,
      ),
    ]);
  const name = panel(labels.characterName, 32, [
    field("character_name", labels.characterName, "text", {
      height: { mode: "fill" },
    }),
  ]);
  const points = panel(labels.fatePoints, 32, [
    field("fate_points", labels.fatePoints, "number", {
      height: { mode: "fill" },
    }),
  ]);
  // This heading is plain in the reference, unlike the other ornaments.
  points.topOrnament = {
    ...points.topOrnament!,
    preset: "legacy-pill",
    align: "center",
    fontSize: 9,
  };
  name.box.padding = points.box.padding = {
    top: 6,
    right: 8,
    bottom: 2,
    left: 8,
  };
  points.box.width = { mode: "fixed", value: 80 };
  const left = frame(
    "Fate / left",
    [
      frame(labels.characterName, [name, points], {}, "horizontal", 0),
      multilinePanel("description", labels.description, 179),
      lines("aspect", labels.aspects, 4, 152, [labels.highConcept, labels.trouble]),
      lines("consequence", labels.consequences, 3, 122, [labels.mildConsequence, labels.moderateConsequence, labels.severeConsequence]),
      frame(
        labels.physical,
        [
          stress("physical_stress", labels.physical),
          stress("mental_stress", labels.mental),
        ],
        {},
        "horizontal",
        0,
      ),
    ],
    {},
    "vertical",
    14.5,
  );
  const right = frame(
    "Fate / right",
    [
      panel(
        labels.portrait,
        291,
        [
          field("portrait", labels.portrait, "avatar", {
            height: { mode: "fill" },
          }),
        ],
        true,
      ),
      multilinePanel("stunts", labels.stunts, 134),
      multilinePanel("extras", labels.extras, 134),
    ],
    {},
    "vertical",
    15,
  );
  const upper = frame("Fate / columns", [left, right], {}, "horizontal", 10);
  const rankRows = Array.from({ length: 5 }, (_, row) => {
    const rank = 5 - row;
    const cells: LayoutNode[] = [
      {
        id: crypto.randomUUID(),
        kind: "text",
        name: `+${rank}`,
        text: `+${rank}`,
        variant: "body",
        align: "left",
        weight: "normal",
        fontFamily: "Noto Sans",
        uppercase: false,
        color: "ink",
        box: box({
          width: { mode: "fixed", value: 36 },
          padding: { top: 8, right: 4, bottom: 4, left: 8 },
        }),
      },
    ];
    for (let column = 0; column < 5; column++) {
      const active = column < row;
      cells.push(
        frame(
          `Skill +${rank} / ${column + 1}`,
          active
            ? [
                field(
                  `skill_${rank}_${column + 1}`,
                  `${labels.skill} (+${rank}), ${column + 1}`,
                  "text",
                  { height: { mode: "fill" } },
                ),
              ]
            : [],
          {
            strokeColor: active ? "ink" : "subtle",
            strokeWidth: {
              top: active && column === row - 1 ? 1 : 0,
              right: 1,
              bottom: 1,
              left: column === 0 ? 1 : 0,
            },
            height: { mode: "fill" },
          },
        ),
      );
    }
    return frame(
      `+${rank}`,
      cells,
      { height: { mode: "fill" }, minHeight: 37 },
      "horizontal",
    );
  });
  const skills = panel(labels.skills, 188, rankRows);
  skills.box.padding = { top: 0, right: 0, bottom: 0, left: 0 };
  const desktop = frame(
    "Fate Core / A4",
    [upper, skills],
    {
      width: { mode: "fixed", value: 595 },
      height: { mode: "hug" },
      minHeight: 842,
      padding: { top: 25, right: 25, bottom: 25, left: 25 },
      fill: "surface",
    },
    "vertical",
    15,
  );
  const print = structuredClone(desktop);
  print.box.height = { mode: "fixed", value: 842 };
  const mobile = structuredClone(desktop);
  mobile.name = "Fate Core / mobile";
  mobile.box.width = { mode: "fill" };
  mobile.box.minHeight = undefined;
  mobile.box.padding = { top: 24, right: 12, bottom: 16, left: 12 };
  const mobileUpper = mobile.children[0];
  if (mobileUpper.kind === "frame") {
    mobileUpper.direction = "vertical";
    mobileUpper.gap = 15;
  }
  const mobileSkills = mobile.children[1];
  if (mobileSkills.kind === "frame") {
    mobileSkills.box.height = { mode: "hug" };
    mobileSkills.box.padding = { top: 8, right: 8, bottom: 8, left: 8 };
    mobileSkills.gap = 8;
    mobileSkills.children = mobileSkills.children.map((row) => {
      if (row.kind !== "frame") return row;
      row.wrap = true;
      row.gap = 4;
      row.box.height = { mode: "hug" };
      row.children = row.children.filter(
        (cell, index) =>
          index === 0 || (cell.kind === "frame" && cell.children.length > 0),
      );
      for (const cell of row.children.slice(1)) {
        cell.box.minWidth = 110;
        cell.box.strokeWidth = { top: 1, right: 1, bottom: 1, left: 1 };
      }
      return row;
    });
  }
  return {
    layouts: targetLayoutMapSchema.parse({
      desktop,
      print,
      tablet: structuredClone(desktop),
      mobile,
    }),
    fields,
  };
}
