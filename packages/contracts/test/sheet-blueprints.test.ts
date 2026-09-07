import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  boxPropsSchema,
  layoutNodeSchema,
  normalizeLayoutNode,
  repeaterConfigSchema,
  sheetBlueprintDocumentSchema,
  targetLayoutMapSchema,
  validateLayoutNodeConstraints,
} from "../src/index.js";

describe("Sheet Builder Contracts", () => {
  it("validates fillable tables and optional checkbox outlines", () => {
    const table = layoutNodeSchema.parse({
      id: crypto.randomUUID(),
      kind: "table",
      rows: 5,
      columns: 6,
      headerRows: 0,
      headerColumns: 1,
      cellLabels: ["+5"],
      fieldBindingPrefix: "skills",
      readOnly: false,
      box: boxPropsSchema.parse({}),
    });
    const checkbox = layoutNodeSchema.parse({
      id: crypto.randomUUID(),
      kind: "checkbox",
      fieldBinding: "trained",
      label: "Trained",
      shape: "circle",
      showBorder: false,
      readOnly: false,
      box: boxPropsSchema.parse({}),
    });

    expect(table.kind).toBe("table");
    expect(checkbox.kind).toBe("checkbox");
    if (checkbox.kind === "checkbox") expect(checkbox.showBorder).toBe(false);
  });

  it("treats template images as character portrait slots", () => {
    const image = layoutNodeSchema.parse({
      id: crypto.randomUUID(),
      kind: "image",
      url: "",
      alt: "",
      fit: "cover",
      box: boxPropsSchema.parse({}),
    });

    expect(image.kind).toBe("image");
    if (image.kind === "image") expect(image.fieldBinding).toBe("portrait");
  });

  it("validates minimal valid Frame node", () => {
    const validFrame = {
      id: crypto.randomUUID(),
      kind: "frame",
      direction: "vertical",
      gap: 8,
      align: "stretch",
      justify: "start",
      wrap: false,
      collapseAdjacentStrokes: true,
      ornamentStyle: "arc-corner",
      titleDock: { dock: "top", variant: "inline-center", text: "Saving Throws" },
      footerDock: { dock: "none", variant: "none" },
      box: {
        width: { mode: "fill" },
        height: { mode: "hug" },
        padding: { top: 8, right: 8, bottom: 8, left: 8 },
        strokeWidth: { top: 1, right: 1, bottom: 1, left: 1 },
        strokeColor: "accent",
        cornerRadius: { topLeft: 4, topRight: 4, bottomRight: 4, bottomLeft: 4 },
        fill: "surface",
        overflow: "visible",
        hiddenOnTargets: [],
      },
      children: [
        {
          id: crypto.randomUUID(),
          kind: "text",
          text: "Strength",
          variant: "label",
          align: "left",
          weight: "bold",
          uppercase: true,
          color: "default",
          box: {
            width: { mode: "hug" },
            height: { mode: "hug" },
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            strokeWidth: { top: 0, right: 0, bottom: 0, left: 0 },
            strokeColor: "default",
            cornerRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
            fill: "transparent",
            overflow: "visible",
            hiddenOnTargets: [],
          },
        },
      ],
    };

    const parsed = layoutNodeSchema.parse(validFrame);
    expect(parsed.kind).toBe("frame");
    expect(parsed.id).toBe(validFrame.id);
  });

  it("rejects invalid sizing values and negative padding", () => {
    expect(() =>
      boxPropsSchema.parse({
        padding: { top: -5, right: 0, bottom: 0, left: 0 },
      }),
    ).toThrow();

    expect(() =>
      boxPropsSchema.parse({
        width: { mode: "fixed", value: -100 },
      }),
    ).toThrow();
  });

  it("detects duplicate node IDs and excessive nesting depth", () => {
    const dupId = crypto.randomUUID();
    const rootNode = {
      id: dupId,
      kind: "frame" as const,
      direction: "vertical" as const,
      gap: 0,
      align: "start" as const,
      justify: "start" as const,
      wrap: false,
      collapseAdjacentStrokes: false,
      ornamentStyle: "none" as const,
      titleDock: { dock: "none" as const, variant: "none" as const },
      footerDock: { dock: "none" as const, variant: "none" as const },
      box: boxPropsSchema.parse({}),
      children: [
        {
          id: dupId, // duplicate ID
          kind: "text" as const,
          text: "Duplicate",
          variant: "body" as const,
          align: "left" as const,
          weight: "normal" as const,
          uppercase: false,
          color: "default" as const,
          box: boxPropsSchema.parse({}),
        },
      ],
    };

    const check = validateLayoutNodeConstraints(rootNode);
    expect(check.valid).toBe(false);
    expect(check.errors.some((e) => e.includes("Duplicate node ID"))).toBe(true);
  });

  it("validates dynamic repeater schemas", () => {
    const validConfig = {
      key: "weapons",
      mode: "runtime",
      minRows: 0,
      maxRows: 20,
      initialRows: 1,
      allowAdd: true,
      allowRemove: true,
      allowReorder: true,
      addLabel: "Add Weapon",
      removeLabel: "Delete",
      printSplitPolicy: "auto",
      rowFieldSlots: [
        {
          slotId: "weapon_name",
          name: "Weapon Name",
          label: "Name",
          kind: "text",
          defaultValue: "",
          options: [],
        },
        {
          slotId: "attack_bonus",
          name: "Atk Bonus",
          label: "ATK",
          kind: "number",
          defaultValue: 0,
          options: [],
        },
      ],
    };

    const parsed = repeaterConfigSchema.parse(validConfig);
    expect(parsed.key).toBe("weapons");
    expect(parsed.rowFieldSlots).toHaveLength(2);
  });

  it("validates full sheet blueprint document", () => {
    const leaf = {
      id: crypto.randomUUID(),
      kind: "text",
      text: "Hero",
      variant: "title",
      align: "center",
      weight: "bold",
      uppercase: true,
      color: "default",
      box: boxPropsSchema.parse({}),
    };

    const root = {
      id: crypto.randomUUID(),
      kind: "frame",
      direction: "vertical",
      gap: 12,
      align: "stretch",
      justify: "start",
      wrap: false,
      collapseAdjacentStrokes: false,
      ornamentStyle: "regular",
      titleDock: { dock: "none", variant: "none" },
      footerDock: { dock: "none", variant: "none" },
      box: boxPropsSchema.parse({}),
      children: [leaf],
    };

    const doc = {
      schemaVersion: 1,
      sheetDefinitionId: crypto.randomUUID(),
      layouts: {
        mobile: root,
        tablet: root,
        desktop: root,
        print: root,
      },
      fields: [
        {
          id: crypto.randomUUID(),
          key: "character_name",
          label: "Character Name",
          kind: "text",
          defaultValue: "Aragorn",
          options: [],
          readOnly: false,
        },
      ],
    };

    const parsed = sheetBlueprintDocumentSchema.parse(doc);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.fields).toHaveLength(1);
  });

  it("normalizes legacy frame node with ornamentStyle, titleDock and footerDock", () => {
    const legacyFrame = {
      id: crypto.randomUUID(),
      kind: "frame",
      direction: "vertical",
      gap: 8,
      align: "start",
      justify: "start",
      wrap: false,
      collapseAdjacentStrokes: false,
      ornamentStyle: "arc-corner",
      titleDock: { dock: "top", variant: "inline-center", text: "Aspects" },
      footerDock: { dock: "bottom", variant: "diamond-start", text: "Fate Core" },
      box: {
        width: { mode: "fill" },
        height: { mode: "hug" },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        strokeWidth: { top: 1, right: 1, bottom: 1, left: 1 },
        strokeColor: "default",
        cornerRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
        fill: "transparent",
        overflow: "visible",
        hiddenOnTargets: [],
      },
      children: [],
    };

    const parsed = normalizeLayoutNode(legacyFrame);
    expect(parsed.kind).toBe("frame");
    if (parsed.kind === "frame") {
      expect(parsed.cornerOrnaments.preset).toBe("arc-corner");
      expect(parsed.cornerOrnaments.topLeft).toBe(true);
      expect(parsed.topOrnament.preset).toBe("legacy-pill");
      expect(parsed.topOrnament.align).toBe("center");
      expect(parsed.topOrnament.text).toBe("Aspects");
      expect(parsed.bottomOrnament.preset).toBe("legacy-pill");
      expect(parsed.bottomOrnament.align).toBe("start");
      expect(parsed.bottomOrnament.text).toBe("Fate Core");
    }
  });

  it("normalizes legacy ornaments at the target-layout API boundary", () => {
    const legacyRoot = {
      id: crypto.randomUUID(),
      kind: "frame",
      direction: "vertical",
      gap: 9,
      align: "stretch",
      justify: "start",
      wrap: false,
      collapseAdjacentStrokes: false,
      ornamentStyle: "arc-corner",
      titleDock: {
        dock: "top",
        variant: "inline-center",
        text: "Character name",
      },
      footerDock: { dock: "none", variant: "none" },
      box: {
        width: { mode: "fill" },
        height: { mode: "hug" },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        strokeWidth: { top: 1, right: 1, bottom: 1, left: 1 },
        strokeColor: "ink",
        cornerRadius: {
          topLeft: 0,
          topRight: 0,
          bottomRight: 0,
          bottomLeft: 0,
        },
        fill: "surface",
        overflow: "visible",
        hiddenOnTargets: [],
      },
      children: [],
    };

    const layouts = targetLayoutMapSchema.parse({
      mobile: structuredClone(legacyRoot),
      tablet: structuredClone(legacyRoot),
      desktop: structuredClone(legacyRoot),
      print: structuredClone(legacyRoot),
    });

    expect(layouts.print.kind).toBe("frame");
    if (layouts.print.kind === "frame") {
      expect(layouts.print.cornerOrnaments?.preset).toBe("arc-corner");
      expect(layouts.print.topOrnament?.text).toBe("Character name");
      expect(layouts.print).not.toHaveProperty("ornamentStyle");
      expect(layouts.print).not.toHaveProperty("titleDock");
      expect(layouts.print).not.toHaveProperty("footerDock");
    }
  });

  it("validates new Fate corner turnbacks and Fate title ornaments with letterSpacingPx", () => {
    const modernFateFrame = {
      id: crypto.randomUUID(),
      kind: "frame",
      direction: "vertical",
      gap: 12,
      align: "stretch",
      justify: "start",
      wrap: false,
      collapseAdjacentStrokes: false,
      cornerOrnaments: {
        preset: "fate-turnback",
        topLeft: true,
        topRight: true,
        bottomRight: false,
        bottomLeft: true,
      },
      topOrnament: {
        preset: "fate",
        align: "center",
        offset: 0,
        text: "SKILLS",
        fontFamily: "Montserrat Alternates",
        fontSize: 10,
        fontWeight: "medium",
        letterSpacingPx: -0.9,
      },
      bottomOrnament: {
        preset: "none",
        align: "center",
        offset: 0,
        text: "",
        fontFamily: "Montserrat Alternates",
        fontSize: 10,
        fontWeight: "medium",
        letterSpacingPx: -0.9,
      },
      box: {
        width: { mode: "fill" },
        height: { mode: "hug" },
        padding: { top: 8, right: 8, bottom: 8, left: 8 },
        strokeWidth: { top: 1, right: 1, bottom: 1, left: 1 },
        strokeColor: "default",
        cornerRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
        fill: "transparent",
        overflow: "visible",
        hiddenOnTargets: [],
      },
      children: [],
    };

    const parsed = layoutNodeSchema.parse(modernFateFrame);
    expect(parsed.kind).toBe("frame");
    if (parsed.kind === "frame") {
      expect(parsed.cornerOrnaments.preset).toBe("fate-turnback");
      expect(parsed.cornerOrnaments.bottomRight).toBe(false);
      expect(parsed.topOrnament.preset).toBe("fate");
      expect(parsed.topOrnament.letterSpacingPx).toBe(-0.9);
    }
  });
});
