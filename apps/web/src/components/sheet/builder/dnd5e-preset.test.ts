import { describe, expect, it } from "vitest";
import { MAX_SHEET_TRANSFER_BYTES, sheetTransferDocumentSchema, validateLayoutNodeConstraints, type LayoutNode } from "@mycharacter/contracts";
import { createDnd5ePreset, dnd5eLabelKeys, type Dnd5eLabels } from "./dnd5e-preset";
const labels = Object.fromEntries(dnd5eLabelKeys.map(key => [key, key])) as Dnd5eLabels;
const bindings = (node: LayoutNode): string[] => node.kind === "frame" ? node.children.flatMap(bindings)
  : "fieldBinding" in node ? [node.fieldBinding, ...(node.kind === "textarea" ? [...(node.itemBindings ?? []), ...(node.itemCheckboxBindings ?? [])] : [])] : [];
describe("D&D 5e native preset", () => {
  it("keeps every control bound across three pages and adaptive targets, with a portable document", () => {
    const preset = createDnd5ePreset(labels);
    const keys = preset.fields.map(field => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const root of Object.values(preset.layouts)) {
      expect([...new Set(bindings(root))].sort()).toEqual([...keys].sort());
      expect(validateLayoutNodeConstraints(root).errors).toEqual([]);
    }
    const document = { format: "mycharacter-sheet", formatVersion: 1, title: "D&D 5e", ...preset };
    expect(sheetTransferDocumentSchema.safeParse(document).success).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(document)).length).toBeLessThan(MAX_SHEET_TRANSFER_BYTES);
    const print = preset.layouts.print;
    expect(print.kind === "frame" && print.children.filter(child => child.kind === "frame" && child.printAsPage)).toHaveLength(3);
    expect(keys.filter(key => /^spell_\d_\d+$/.test(key))).toHaveLength(100);
    expect(keys.filter(key => /^spell_\d_\d+_prepared$/.test(key))).toHaveLength(92);
    expect(keys.filter(key => /^spell_slots_/.test(key))).toHaveLength(18);
  });
  it("stacks main desktop columns on mobile while retaining usable attribute and prepared columns", () => {
    const preset = createDnd5ePreset(labels);
    const find = (node: LayoutNode, id: string): LayoutNode | undefined => node.id === id ? node
      : node.kind === "frame" ? node.children.map(child => find(child, id)).find(Boolean) : undefined;
    const desktop = preset.layouts.desktop;
    if (desktop.kind !== "frame" || desktop.children[0].kind !== "frame") throw new Error("Expected pages");
    const columns = desktop.children[0].children[1];
    expect(columns.kind === "frame" && columns.direction).toBe("horizontal");
    const mobileColumns = find(preset.layouts.mobile, columns.id);
    expect(mobileColumns?.kind === "frame" && mobileColumns.direction).toBe("vertical");
    if (mobileColumns?.kind !== "frame") throw new Error("Expected mobile columns");
    expect(mobileColumns.children[0].box.width.mode).toBe("fill");
  });
});
