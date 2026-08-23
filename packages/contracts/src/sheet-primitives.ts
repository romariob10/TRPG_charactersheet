import { z } from "zod";

export const TARGET_LAYOUT_KINDS = ["mobile", "tablet", "desktop", "print"] as const;
export const targetLayoutKindSchema = z.enum(TARGET_LAYOUT_KINDS);
export type TargetLayoutKind = z.infer<typeof targetLayoutKindSchema>;

export const SIZING_MODES = ["fill", "hug", "fixed"] as const;
export const sizingModeSchema = z.enum(SIZING_MODES);
export type SizingMode = z.infer<typeof sizingModeSchema>;

export const sizingValueSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("fill") }),
  z.object({ mode: z.literal("hug") }),
  z.object({
    mode: z.literal("fixed"),
    value: z.number().finite().min(1).max(4000),
  }),
]);
export type SizingValue = z.infer<typeof sizingValueSchema>;

export const paddingSchema = z.object({
  top: z.number().finite().min(0).max(500),
  right: z.number().finite().min(0).max(500),
  bottom: z.number().finite().min(0).max(500),
  left: z.number().finite().min(0).max(500),
});
export type Padding = z.infer<typeof paddingSchema>;

export const strokeWidthSchema = z.object({
  top: z.number().finite().min(0).max(50),
  right: z.number().finite().min(0).max(50),
  bottom: z.number().finite().min(0).max(50),
  left: z.number().finite().min(0).max(50),
});
export type StrokeWidth = z.infer<typeof strokeWidthSchema>;

export const cornerRadiusSchema = z.object({
  topLeft: z.number().finite().min(0).max(200),
  topRight: z.number().finite().min(0).max(200),
  bottomRight: z.number().finite().min(0).max(200),
  bottomLeft: z.number().finite().min(0).max(200),
});
export type CornerRadius = z.infer<typeof cornerRadiusSchema>;

export const STROKE_TOKENS = [
  "default",
  "subtle",
  "accent",
  "primary",
  "danger",
  "none",
  "gold",
  "parchment",
  "ink",
] as const;
export const strokeTokenSchema = z.enum(STROKE_TOKENS);
export type StrokeToken = z.infer<typeof strokeTokenSchema>;

export const FILL_TOKENS = [
  "transparent",
  "surface",
  "surface-subtle",
  "card",
  "parchment",
  "dark",
  "accent-subtle",
] as const;
export const fillTokenSchema = z.enum(FILL_TOKENS);
export type FillToken = z.infer<typeof fillTokenSchema>;

export const OVERFLOW_MODES = ["visible", "hidden", "auto"] as const;
export const overflowModeSchema = z.enum(OVERFLOW_MODES);
export type OverflowMode = z.infer<typeof overflowModeSchema>;

export const LAYOUT_DIRECTIONS = ["horizontal", "vertical"] as const;
export const layoutDirectionSchema = z.enum(LAYOUT_DIRECTIONS);
export type LayoutDirection = z.infer<typeof layoutDirectionSchema>;

export const LAYOUT_ALIGNS = ["start", "center", "end", "stretch"] as const;
export const layoutAlignSchema = z.enum(LAYOUT_ALIGNS);
export type LayoutAlign = z.infer<typeof layoutAlignSchema>;

export const LAYOUT_JUSTIFIES = ["start", "center", "end", "space-between"] as const;
export const layoutJustifySchema = z.enum(LAYOUT_JUSTIFIES);
export type LayoutJustify = z.infer<typeof layoutJustifySchema>;

export const ORNAMENT_STYLES = [
  "none",
  "regular",
  "arc-corner",
  "double-border",
  "parchment-panel",
] as const;
export const ornamentStyleSchema = z.enum(ORNAMENT_STYLES);
export type OrnamentStyle = z.infer<typeof ornamentStyleSchema>;

export const CORNER_ORNAMENT_PRESETS = ["none", "fate-turnback", "arc-corner"] as const;
export const cornerOrnamentPresetSchema = z.enum(CORNER_ORNAMENT_PRESETS);
export type CornerOrnamentPreset = z.infer<typeof cornerOrnamentPresetSchema>;

export const cornerOrnamentsSchema = z.object({
  preset: cornerOrnamentPresetSchema.default("none"),
  topLeft: z.boolean().default(true),
  topRight: z.boolean().default(true),
  bottomRight: z.boolean().default(true),
  bottomLeft: z.boolean().default(true),
});
export type CornerOrnaments = z.infer<typeof cornerOrnamentsSchema>;

export const EDGE_ORNAMENT_PRESETS = [
  "none",
  "fate",
  "dnd",
  "dnd-chevron",
  "dnd-diamond",
  "legacy-pill",
] as const;
export const edgeOrnamentPresetSchema = z.enum(EDGE_ORNAMENT_PRESETS);
export type EdgeOrnamentPreset = z.infer<typeof edgeOrnamentPresetSchema>;

export const edgeOrnamentSchema = z.object({
  preset: edgeOrnamentPresetSchema.default("none"),
  align: z.enum(["start", "center", "end"]).default("center"),
  offset: z.number().finite().default(0),
  text: z.string().trim().max(120).default(""),
  fontFamily: z.enum(["Montserrat Alternates", "Noto Sans", "default"]).default("Montserrat Alternates"),
  fontSize: z.number().finite().min(6).max(48).default(10),
  fontWeight: z.enum(["normal", "medium", "bold", "400", "500", "600", "700"]).default("medium"),
  letterSpacingPx: z.number().finite().min(-10).max(20).default(-0.9),
});
export type EdgeOrnament = z.infer<typeof edgeOrnamentSchema>;

export const TITLE_DOCK_VARIANTS = [
  "none",
  "inline-start",
  "inline-center",
  "diamond-start",
  "diamond-center",
] as const;
export const titleDockVariantSchema = z.enum(TITLE_DOCK_VARIANTS);
export type TitleDockVariant = z.infer<typeof titleDockVariantSchema>;

export const titleDockSchema = z.object({
  dock: z.enum(["top", "bottom", "none"]),
  variant: titleDockVariantSchema,
  text: z.string().trim().max(120).optional(),
});
export type TitleDock = z.infer<typeof titleDockSchema>;

export const boxPropsSchema = z.object({
  width: sizingValueSchema.default({ mode: "fill" }),
  height: sizingValueSchema.default({ mode: "hug" }),
  minWidth: z.number().finite().min(0).max(4000).optional(),
  maxWidth: z.number().finite().min(0).max(4000).optional(),
  minHeight: z.number().finite().min(0).max(4000).optional(),
  maxHeight: z.number().finite().min(0).max(4000).optional(),
  padding: paddingSchema.default({ top: 0, right: 0, bottom: 0, left: 0 }),
  strokeWidth: strokeWidthSchema.default({ top: 0, right: 0, bottom: 0, left: 0 }),
  strokeColor: strokeTokenSchema.default("default"),
  cornerRadius: cornerRadiusSchema.default({
    topLeft: 0,
    topRight: 0,
    bottomRight: 0,
    bottomLeft: 0,
  }),
  fill: fillTokenSchema.default("transparent"),
  overflow: overflowModeSchema.default("visible"),
  hiddenOnTargets: z.array(targetLayoutKindSchema).default([]),
});
export type BoxProps = z.infer<typeof boxPropsSchema>;

export const defaultBoxProps: BoxProps = {
  width: { mode: "fill" },
  height: { mode: "hug" },
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  strokeWidth: { top: 0, right: 0, bottom: 0, left: 0 },
  strokeColor: "default",
  cornerRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  fill: "transparent",
  overflow: "visible",
  hiddenOnTargets: [],
};
