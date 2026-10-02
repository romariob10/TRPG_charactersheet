import { describe, expect, it } from "vitest";
import { layoutNodeSchema, type LayoutNode } from "@mycharacter/contracts";
import { createFateCorePreset, fateCoreLabelKeys } from "./fate-core-preset";
function bindings(node: LayoutNode): string[] {
  if (node.kind === "frame") return node.children.flatMap(bindings);
  return "fieldBinding" in node ? [node.fieldBinding, ...(node.kind === "textarea" ? node.itemBindings ?? [] : [])] : [];
}
describe("Fate Core preset", () => {
  it("preserves legacy bindings and list controls to the same fields across adaptive and static layouts", () => {
    const labels = Object.fromEntries(
      fateCoreLabelKeys.map((key) => [key, key]),
    ) as Record<(typeof fateCoreLabelKeys)[number], string>;
    const { layouts, fields } = createFateCorePreset(labels);
    expect(fields).toHaveLength(33);
    const keys = fields.map((field) => field.key).sort();
    for (const layout of Object.values(layouts)) {
      expect(bindings(layout).sort()).toEqual(keys);
      expect(layoutNodeSchema.safeParse(layout).success).toBe(true);
    }
    expect(layouts.desktop.box.height.mode).toBe("hug");
    expect(layouts.print.box.height).toEqual({ mode: "fixed", value: 842 });
    expect(
      layouts.mobile.kind === "frame" &&
        layouts.mobile.children[0].kind === "frame" &&
        layouts.mobile.children[0].direction,
    ).toBe("vertical");
  });
  it("accepts stress arcs and rejects unsupported shapes", () => {
    const { layouts } = createFateCorePreset(
      Object.fromEntries(fateCoreLabelKeys.map((key) => [key, key])) as Record<
        (typeof fateCoreLabelKeys)[number],
        string
      >,
    );
    const findCheckbox = (node: LayoutNode): LayoutNode | undefined =>
      node.kind === "checkbox"
        ? node
        : node.kind === "frame"
          ? node.children.map(findCheckbox).find(Boolean)
          : undefined;
    const checkbox = findCheckbox(layouts.desktop)!;
    expect(layoutNodeSchema.safeParse(checkbox).success).toBe(true);
    expect(
      layoutNodeSchema.safeParse({ ...checkbox, shape: "triangle" }).success,
    ).toBe(false);
  });
});
