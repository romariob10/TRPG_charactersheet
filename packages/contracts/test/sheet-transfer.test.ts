import { describe, expect, it } from "vitest";
import { createSheetTransferDocument, sheetTransferDocumentSchema, applyComponentOverrides, defaultBoxProps, layoutNodeSchema, componentVersionDetailsSchema } from "../src/index.js";
import type { LayoutNode } from "../src/index.js";

const text = (): LayoutNode => layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "text", text: "Original", box: defaultBoxProps });
const frame = (children: LayoutNode[] = []): LayoutNode => layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "frame", box: defaultBoxProps, children });
const layouts = (node: LayoutNode) => ({ desktop: node, print: node, mobile: node, tablet: node });

describe("portable sheets", () => {
  it("round trips all layouts and field names without server identity or character values", () => {
    const root = frame([layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "field-input", fieldBinding: "name", name: "Character name", box: defaultBoxProps })]);
    const document = createSheetTransferDocument("Fate", layouts(root), []);
    expect(document.fields[0].label).toBe("Character name");
    expect(sheetTransferDocumentSchema.parse(JSON.parse(JSON.stringify(document)))).toEqual(document);
    expect(Object.keys(document).sort()).toEqual(["fields", "format", "formatVersion", "layouts", "title"]);
  });
  it("rejects unsupported versions, unresolved components, invalid bindings, duplicate fields and excessive nesting", () => {
    const document = createSheetTransferDocument("Fate", layouts(frame()), []);
    expect(sheetTransferDocumentSchema.safeParse({ ...document, formatVersion: 2 }).success).toBe(false);
    const field = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "field-input", fieldBinding: "missing", box: defaultBoxProps });
    expect(sheetTransferDocumentSchema.safeParse({ ...document, layouts: layouts(frame([field])) }).success).toBe(false);
    let deep = frame();
    for (let i = 0; i < 50; i++) deep = frame([deep]);
    expect(sheetTransferDocumentSchema.safeParse({ ...document, layouts: layouts(deep) }).success).toBe(false);
    const withFields = createSheetTransferDocument("Fate", layouts(frame([field])), []);
    expect(sheetTransferDocumentSchema.safeParse({ ...withFields, fields: [...withFields.fields, ...withFields.fields] }).success).toBe(false);
  });
  it("embeds repeated components with exposed values and independent IDs", () => {
    const leaf = text();
    const version = componentVersionDetailsSchema.parse({ id: crypto.randomUUID(), componentId: crypto.randomUUID(), versionNumber: 1, schemaVersion: 1, layouts: layouts(frame([leaf])), exposedProperties: [{ propertyId: "title", type: "text", name: "Title", targetNodeId: leaf.id, targetPropPath: "text" }], dependencies: [], changelog: "", authorId: crypto.randomUUID(), createdAt: "now" });
    const instance = () => layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "component-instance", componentId: version.componentId, componentVersionId: version.id, propertyOverrides: { title: "Changed" }, box: defaultBoxProps });
    const root = frame([instance(), instance()]);
    expect(() => createSheetTransferDocument("Fate", layouts(root), [])).toThrow();
    const document = createSheetTransferDocument("Fate", layouts(root), [], { [version.id]: version });
    expect(JSON.stringify(document)).toContain("Changed");
    expect(JSON.stringify(document)).not.toContain("component-instance");
    expect(sheetTransferDocumentSchema.safeParse(document).success).toBe(true);
    expect(leaf.kind === "text" && leaf.text).toBe("Original");
  });
  it("ignores prototype paths and invalid exposed property values", () => {
    const leaf = text();
    const properties = [{ propertyId: "bad", targetNodeId: leaf.id, targetPropPath: "__proto__.polluted" }, { propertyId: "text", targetNodeId: leaf.id, targetPropPath: "text" }];
    expect(applyComponentOverrides(leaf, properties, { bad: true, text: 12 })).toEqual(leaf);
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });
});
