import { z } from "zod";

export const REPEATER_MODES = ["design", "runtime"] as const;
export const repeaterModeSchema = z.enum(REPEATER_MODES);
export type RepeaterMode = z.infer<typeof repeaterModeSchema>;

export const PRINT_SPLIT_POLICIES = ["auto", "avoid-break"] as const;
export const printSplitPolicySchema = z.enum(PRINT_SPLIT_POLICIES);
export type PrintSplitPolicy = z.infer<typeof printSplitPolicySchema>;

export const ROW_FIELD_KINDS = ["text", "number", "checkbox", "select", "textarea"] as const;
export const rowFieldKindSchema = z.enum(ROW_FIELD_KINDS);
export type RowFieldKind = z.infer<typeof rowFieldKindSchema>;

export const rowFieldSlotSchema = z.object({
  slotId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().max(120).default(""),
  kind: rowFieldKindSchema.default("text"),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  options: z.array(z.string().trim().max(120)).max(50).default([]),
});
export type RowFieldSlot = z.infer<typeof rowFieldSlotSchema>;

export const repeaterConfigSchema = z.object({
  key: z.string().trim().min(1).max(64),
  mode: repeaterModeSchema.default("runtime"),
  minRows: z.number().int().min(0).max(100).default(0),
  maxRows: z.number().int().min(1).max(100).default(50),
  initialRows: z.number().int().min(0).max(100).default(0),
  allowAdd: z.boolean().default(true),
  allowRemove: z.boolean().default(true),
  allowReorder: z.boolean().default(true),
  emptyStateText: z.string().trim().max(200).optional(),
  addLabel: z.string().trim().max(60).optional(),
  removeLabel: z.string().trim().max(60).optional(),
  printSplitPolicy: printSplitPolicySchema.default("auto"),
  rowFieldSlots: z.array(rowFieldSlotSchema).max(30).default([]),
});
export type RepeaterConfig = z.infer<typeof repeaterConfigSchema>;

export const repeaterRowValueSchema = z.union([
  z.string().max(10_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export type RepeaterRowValue = z.infer<typeof repeaterRowValueSchema>;

export const characterRepeaterRowSchema = z.object({
  id: z.string().uuid(),
  characterId: z.string().uuid(),
  repeaterKey: z.string().min(1).max(64),
  position: z.number().int().nonnegative(),
  values: z.record(z.string(), repeaterRowValueSchema),
  version: z.number().int().nonnegative(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid().nullable(),
});
export type CharacterRepeaterRow = z.infer<typeof characterRepeaterRowSchema>;

export const addRepeaterRowRequestSchema = z.object({
  repeaterKey: z.string().trim().min(1).max(64),
  position: z.number().int().nonnegative().optional(),
  initialValues: z.record(z.string(), repeaterRowValueSchema).optional(),
  clientMutationId: z.string().uuid(),
});
export type AddRepeaterRowRequest = z.infer<typeof addRepeaterRowRequestSchema>;

export const updateRepeaterRowFieldRequestSchema = z.object({
  value: repeaterRowValueSchema,
  expectedVersion: z.number().int().nonnegative(),
  clientMutationId: z.string().uuid(),
});
export type UpdateRepeaterRowFieldRequest = z.infer<
  typeof updateRepeaterRowFieldRequestSchema
>;

export const reorderRepeaterRowsRequestSchema = z.object({
  repeaterKey: z.string().trim().min(1).max(64),
  rowIds: z.array(z.string().uuid()).min(1).max(100),
  clientMutationId: z.string().uuid(),
});
export type ReorderRepeaterRowsRequest = z.infer<
  typeof reorderRepeaterRowsRequestSchema
>;

export const deleteRepeaterRowRequestSchema = z.object({
  clientMutationId: z.string().uuid(),
});
export type DeleteRepeaterRowRequest = z.infer<
  typeof deleteRepeaterRowRequestSchema
>;
