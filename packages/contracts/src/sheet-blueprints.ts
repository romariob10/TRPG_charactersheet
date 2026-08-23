import { z } from "zod";
import {
  boxPropsSchema,
  defaultBoxProps,
  layoutAlignSchema,
  layoutDirectionSchema,
  layoutJustifySchema,
  ornamentStyleSchema,
  strokeTokenSchema,
  titleDockSchema,
} from "./sheet-primitives.js";
import {
  propertyOverrideValueSchema,
  exposedPropertyDefinitionSchema,
} from "./sheet-components.js";
import { repeaterConfigSchema } from "./sheet-repeaters.js";

const textVariantSchema = z.enum(["body", "label", "title", "display", "caption"]);
const textAlignSchema = z.enum(["left", "center", "right"]);
const textWeightSchema = z.enum(["normal", "medium", "bold"]);
const inputVariantSchema = z.enum(["boxed", "underline", "plain"]);
const numberInputVariantSchema = z.enum(["boxed", "underline", "circle", "plain"]);
const checkboxShapeSchema = z.enum(["square", "circle"]);
const imageFitSchema = z.enum(["cover", "contain", "fill"]);

const baseNodeProps = {
  id: z.string().uuid(),
  box: boxPropsSchema.default(defaultBoxProps),
  name: z.string().trim().max(120).optional(),
};

export const textFontFamilySchema = z.enum(["Montserrat Alternates", "Noto Sans", "default"]);
export const textFontWeightSchema = z.enum(["normal", "medium", "bold", "400", "500", "600", "700"]);

export const textNodeSchema = z.object({
  ...baseNodeProps,
  kind: z.literal("text"),
  text: z.string().max(2000).default(""),
  variant: textVariantSchema.default("body"),
  align: textAlignSchema.default("left"),
  weight: textWeightSchema.default("normal"),
  fontFamily: textFontFamilySchema.default("default"),
  fontSize: z.number().finite().min(6).max(120).optional(),
  fontWeight: textFontWeightSchema.optional(),
  letterSpacing: z.number().finite().min(-0.20).max(0.20).optional(),
  lineHeight: z.number().finite().min(0.8).max(2.5).optional(),
  uppercase: z.boolean().default(false),
  color: strokeTokenSchema.default("default"),
});
export type TextNode = z.infer<typeof textNodeSchema>;

export const fieldInputNodeSchema = z.object({
  ...baseNodeProps,
  kind: z.literal("field-input"),
  fieldBinding: z.string().trim().min(1).max(64),
  label: z.string().trim().max(120).default(""),
  placeholder: z.string().trim().max(120).default(""),
  variant: inputVariantSchema.default("underline"),
  readOnly: z.boolean().default(false),
});
export type FieldInputNode = z.infer<typeof fieldInputNodeSchema>;

export const numberInputNodeSchema = z.object({
  ...baseNodeProps,
  kind: z.literal("number-input"),
  fieldBinding: z.string().trim().min(1).max(64),
  label: z.string().trim().max(120).default(""),
  placeholder: z.string().trim().max(120).default(""),
  variant: numberInputVariantSchema.default("boxed"),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  step: z.number().finite().optional(),
  showSign: z.boolean().default(false),
  readOnly: z.boolean().default(false),
});
export type NumberInputNode = z.infer<typeof numberInputNodeSchema>;

export const textareaNodeSchema = z.object({
  ...baseNodeProps,
  kind: z.literal("textarea"),
  fieldBinding: z.string().trim().min(1).max(64),
  label: z.string().trim().max(120).default(""),
  placeholder: z.string().trim().max(120).default(""),
  rows: z.number().int().min(1).max(20).default(3),
  variant: inputVariantSchema.default("boxed"),
  readOnly: z.boolean().default(false),
});
export type TextareaNode = z.infer<typeof textareaNodeSchema>;

export const checkboxNodeSchema = z.object({
  ...baseNodeProps,
  kind: z.literal("checkbox"),
  fieldBinding: z.string().trim().min(1).max(64),
  label: z.string().trim().max(120).default(""),
  shape: checkboxShapeSchema.default("circle"),
  readOnly: z.boolean().default(false),
});
export type CheckboxNode = z.infer<typeof checkboxNodeSchema>;

export const selectOptionSchema = z.object({
  label: z.string().trim().max(120),
  value: z.string().trim().max(120),
});
export type SelectOption = z.infer<typeof selectOptionSchema>;

export const selectNodeSchema = z.object({
  ...baseNodeProps,
  kind: z.literal("select"),
  fieldBinding: z.string().trim().min(1).max(64),
  label: z.string().trim().max(120).default(""),
  placeholder: z.string().trim().max(120).default(""),
  options: z.array(selectOptionSchema).max(50).default([]),
  readOnly: z.boolean().default(false),
});
export type SelectNode = z.infer<typeof selectNodeSchema>;

export const imageNodeSchema = z.object({
  ...baseNodeProps,
  kind: z.literal("image"),
  url: z.string().trim().max(1000).default(""),
  alt: z.string().trim().max(200).default(""),
  fit: imageFitSchema.default("cover"),
  aspectRatio: z.string().trim().max(20).optional(),
});
export type ImageNode = z.infer<typeof imageNodeSchema>;

export const dividerNodeSchema = z.object({
  ...baseNodeProps,
  kind: z.literal("divider"),
  direction: layoutDirectionSchema.default("horizontal"),
  strokeWidth: z.number().finite().min(0.5).max(20).default(1),
  strokeColor: strokeTokenSchema.default("subtle"),
});
export type DividerNode = z.infer<typeof dividerNodeSchema>;

export const spacerNodeSchema = z.object({
  ...baseNodeProps,
  kind: z.literal("spacer"),
  size: z.number().finite().min(0).max(500).default(8),
  fill: z.boolean().default(false),
});
export type SpacerNode = z.infer<typeof spacerNodeSchema>;

export const componentInstanceNodeSchema = z.object({
  ...baseNodeProps,
  kind: z.literal("component-instance"),
  componentId: z.string().uuid(),
  componentVersionId: z.string().uuid(),
  propertyOverrides: z.record(z.string(), propertyOverrideValueSchema).default({}),
});
export type ComponentInstanceNode = z.infer<typeof componentInstanceNodeSchema>;

// Recursive types for Frame and Repeater nodes:
export type LayoutNode =
  | TextNode
  | FieldInputNode
  | NumberInputNode
  | TextareaNode
  | CheckboxNode
  | SelectNode
  | ImageNode
  | DividerNode
  | SpacerNode
  | ComponentInstanceNode
  | FrameNode
  | RepeaterNode;

export interface FrameNode {
  id: string;
  kind: "frame";
  box: z.infer<typeof boxPropsSchema>;
  name?: string;
  direction: z.infer<typeof layoutDirectionSchema>;
  gap: number;
  align: z.infer<typeof layoutAlignSchema>;
  justify: z.infer<typeof layoutJustifySchema>;
  wrap: boolean;
  collapseAdjacentStrokes: boolean;
  ornamentStyle: z.infer<typeof ornamentStyleSchema>;
  titleDock: z.infer<typeof titleDockSchema>;
  footerDock: z.infer<typeof titleDockSchema>;
  children: LayoutNode[];
}

export interface RepeaterNode {
  id: string;
  kind: "repeater";
  box: z.infer<typeof boxPropsSchema>;
  name?: string;
  config: z.infer<typeof repeaterConfigSchema>;
  rowTemplate: LayoutNode;
}

export const layoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    textNodeSchema,
    fieldInputNodeSchema,
    numberInputNodeSchema,
    textareaNodeSchema,
    checkboxNodeSchema,
    selectNodeSchema,
    imageNodeSchema,
    dividerNodeSchema,
    spacerNodeSchema,
    componentInstanceNodeSchema,
    z.object({
      ...baseNodeProps,
      kind: z.literal("frame"),
      direction: layoutDirectionSchema.default("vertical"),
      gap: z.number().finite().min(0).max(500).default(0),
      align: layoutAlignSchema.default("start"),
      justify: layoutJustifySchema.default("start"),
      wrap: z.boolean().default(false),
      collapseAdjacentStrokes: z.boolean().default(false),
      ornamentStyle: ornamentStyleSchema.default("none"),
      titleDock: titleDockSchema.default({ dock: "none", variant: "none" }),
      footerDock: titleDockSchema.default({ dock: "none", variant: "none" }),
      children: z.array(layoutNodeSchema).default([]),
    }),
    z.object({
      ...baseNodeProps,
      kind: z.literal("repeater"),
      config: repeaterConfigSchema,
      rowTemplate: layoutNodeSchema,
    }),
  ]),
);

export const targetLayoutMapSchema = z.object({
  mobile: layoutNodeSchema,
  tablet: layoutNodeSchema,
  desktop: layoutNodeSchema,
  print: layoutNodeSchema,
});
export type TargetLayoutMap = z.infer<typeof targetLayoutMapSchema>;

export const SEMANTIC_FIELD_KINDS = [
  "text",
  "multiline",
  "number",
  "checkbox",
  "select",
  "avatar",
] as const;
export const semanticFieldKindSchema = z.enum(SEMANTIC_FIELD_KINDS);
export type SemanticFieldKind = z.infer<typeof semanticFieldKindSchema>;

export const sheetFieldDefinitionSchema = z.object({
  id: z.string().uuid(),
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  kind: semanticFieldKindSchema.default("text"),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  options: z.array(z.string().trim().max(120)).max(50).default([]),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  readOnly: z.boolean().default(false),
  description: z.string().trim().max(500).optional(),
});
export type SheetFieldDefinition = z.infer<typeof sheetFieldDefinitionSchema>;

export const sheetBlueprintDocumentSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  sheetDefinitionId: z.string().uuid(),
  layouts: targetLayoutMapSchema,
  fields: z.array(sheetFieldDefinitionSchema).default([]),
});
export type SheetBlueprintDocument = z.infer<
  typeof sheetBlueprintDocumentSchema
>;

export const componentBlueprintDocumentSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  componentId: z.string().uuid(),
  layouts: targetLayoutMapSchema,
  exposedProperties: z.array(exposedPropertyDefinitionSchema).default([]),
  dependencies: z.array(z.string().uuid()).default([]),
});
export type ComponentBlueprintDocument = z.infer<
  typeof componentBlueprintDocumentSchema
>;

/**
 * Validates document constraints:
 * - Max depth (<= 12)
 * - Max total node count (<= 500)
 * - Node IDs are unique
 */
export function validateLayoutNodeConstraints(
  root: LayoutNode,
  maxDepth = 12,
  maxNodes = 500,
): { valid: boolean; errors: string[]; nodeCount: number } {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  let totalNodes = 0;

  function traverse(node: LayoutNode, currentDepth: number) {
    totalNodes++;
    if (seenIds.has(node.id)) {
      errors.push(`Duplicate node ID detected: ${node.id}`);
    } else {
      seenIds.add(node.id);
    }

    if (currentDepth > maxDepth) {
      errors.push(
        `Node ${node.id} exceeds maximum nesting depth of ${maxDepth} (current: ${currentDepth})`,
      );
    }

    if (node.kind === "frame") {
      for (const child of node.children) {
        traverse(child, currentDepth + 1);
      }
    } else if (node.kind === "repeater") {
      traverse(node.rowTemplate, currentDepth + 1);
    }
  }

  traverse(root, 1);

  if (totalNodes > maxNodes) {
    errors.push(
      `Layout exceeds maximum node limit of ${maxNodes} (contains ${totalNodes} nodes)`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    nodeCount: totalNodes,
  };
}
