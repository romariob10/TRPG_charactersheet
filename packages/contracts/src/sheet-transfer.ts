import { z } from "zod";
import {
  layoutNodeSchema,
  sheetFieldDefinitionSchema,
  targetLayoutMapSchema,
  validateLayoutNodeConstraints,
  type LayoutNode,
  type TargetLayoutMap,
  type SheetFieldDefinition,
} from "./sheet-blueprints.js";
import type { TargetLayoutKind } from "./sheet-primitives.js";
import { ensureBoundFieldDefinitions } from "./sheet-fields.js";
import type { ComponentVersionDetails } from "./sheet-builder-api.js";
import type { ExposedPropertyDefinition, PropertyOverrideValue } from "./sheet-components.js";

export const MAX_SHEET_TRANSFER_BYTES = 1024 * 1024;

// Bound recursion before the recursive layout schema sees an untrusted document.
const boundedDocument = z.unknown().superRefine((value, ctx) => {
  const pending = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const next = pending.pop()!;
    if (++count > 30000 || next.depth > 32) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sheet document is too complex." });
      return;
    }
    if (next.value && typeof next.value === "object") {
      for (const child of Object.values(next.value)) pending.push({ value: child, depth: next.depth + 1 });
    }
  }
});

export const sheetTransferDocumentSchema = boundedDocument.pipe(z.object({
  format: z.literal("mycharacter-sheet"),
  formatVersion: z.literal(1),
  title: z.string().trim().min(1).max(160),
  layouts: targetLayoutMapSchema,
  fields: z.array(sheetFieldDefinitionSchema).max(500),
})).superRefine((document, ctx) => {
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const field of document.fields) {
    if (keys.has(field.key) || ids.has(field.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate field definition." });
    keys.add(field.key);
    ids.add(field.id);
  }
  const visit = (node: LayoutNode, inRepeater = false): void => {
    if (node.kind === "component-instance") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Portable sheets must contain resolved components." });
    if (!inRepeater && "fieldBinding" in node && !keys.has(node.fieldBinding)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Missing field definition: ${node.fieldBinding}` });
    if (node.kind === "table" && !inRepeater) {
      for (let row = node.headerRows; row < node.rows; row++) {
        for (let column = node.headerColumns; column < node.columns; column++) {
          if (!keys.has(`${node.fieldBindingPrefix}_${row}_${column}`)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Missing table field definition." });
        }
      }
    }
    if (node.kind === "frame") node.children.forEach((child) => visit(child, inRepeater));
    if (node.kind === "repeater") visit(node.rowTemplate, true);
  };
  for (const root of Object.values(document.layouts)) {
    for (const message of validateLayoutNodeConstraints(root).errors) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    visit(root);
  }
});
export type SheetTransferDocument = z.infer<typeof sheetTransferDocumentSchema>;

export const importSheetRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  document: sheetTransferDocumentSchema,
});
export type ImportSheetRequest = z.infer<typeof importSheetRequestSchema>;

/** Use the same exposed property resolution in screen, PDF and portable sheets. */
export function applyComponentOverrides(
  root: LayoutNode,
  properties: Pick<ExposedPropertyDefinition, "propertyId" | "targetNodeId" | "targetPropPath">[],
  overrides: Record<string, PropertyOverrideValue>,
): LayoutNode {
  let result = structuredClone(root);
  const find = (node: LayoutNode, id: string): LayoutNode | undefined => {
    if (node.id === id) return node;
    if (node.kind === "frame") return node.children.map((child) => find(child, id)).find(Boolean);
    if (node.kind === "repeater") return find(node.rowTemplate, id);
    return undefined;
  };
  for (const property of properties) {
    if (!Object.hasOwn(overrides, property.propertyId)) continue;
    const parts = property.targetPropPath.split(".");
    if (parts.some((part) => ["__proto__", "prototype", "constructor"].includes(part))) continue;
    const candidate = structuredClone(result);
    const node = find(candidate, property.targetNodeId);
    if (!node) continue;
    let target: Record<string, unknown> = node as unknown as Record<string, unknown>;
    let validPath = true;
    for (const part of parts.slice(0, -1)) {
      const next = Object.hasOwn(target, part) ? target[part] : undefined;
      if (!next || typeof next !== "object" || Array.isArray(next)) { validPath = false; break; }
      target = next as Record<string, unknown>;
    }
    const leaf = parts.at(-1);
    if (!validPath || !leaf || !Object.hasOwn(target, leaf)) continue;
    target[leaf] = overrides[property.propertyId];
    const parsed = layoutNodeSchema.safeParse(candidate);
    if (parsed.success) result = parsed.data;
  }
  return result;
}

export function createSheetTransferDocument(
  title: string,
  layouts: TargetLayoutMap,
  fields: SheetFieldDefinition[],
  components: Record<string, ComponentVersionDetails> = {},
): SheetTransferDocument {
  const expand = (node: LayoutNode, target: TargetLayoutKind, chain: Set<string>, depth: number): LayoutNode => {
    if (depth > 12) throw new Error("Sheet nesting exceeds the portable limit.");
    if (node.kind === "component-instance") {
      const version = components[node.componentVersionId];
      if (!version || chain.has(node.componentVersionId)) throw new Error("Component is missing or cyclic.");
      const nextChain = new Set(chain).add(node.componentVersionId);
      const overridden = applyComponentOverrides(version.layouts[target], version.exposedProperties, node.propertyOverrides);
      const root = expand(overridden, target, nextChain, depth + 1);
      const reidentify = (child: LayoutNode): void => {
        child.id = crypto.randomUUID();
        if (child.kind === "frame") child.children.forEach(reidentify);
        if (child.kind === "repeater") reidentify(child.rowTemplate);
      };
      reidentify(root);
      root.box.width = node.box.width.mode === "hug" ? root.box.width : { mode: "fill" };
      root.box.height = node.box.height.mode === "hug" ? root.box.height : { mode: "fill" };
      return { id: node.id, name: node.name, box: structuredClone(node.box), kind: "frame", direction: "vertical", gap: 0, align: "stretch", justify: "start", wrap: false, collapseAdjacentStrokes: false, children: [root] };
    }
    const result = structuredClone(node);
    if (result.kind === "frame") result.children = result.children.map((child) => expand(child, target, chain, depth + 1));
    if (result.kind === "repeater") result.rowTemplate = expand(result.rowTemplate, target, chain, depth + 1);
    return result;
  };
  const portable = Object.fromEntries(Object.entries(layouts).map(([target, root]) => [target, expand(root, target as TargetLayoutKind, new Set(), 1)]));
  return sheetTransferDocumentSchema.parse({ format: "mycharacter-sheet", formatVersion: 1, title, layouts: portable, fields: ensureBoundFieldDefinitions(portable, fields) });
}
