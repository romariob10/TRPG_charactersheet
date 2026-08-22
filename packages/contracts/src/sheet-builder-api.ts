import { z } from "zod";
import { componentScopeSchema, componentSummarySchema, exposedPropertyDefinitionSchema } from "./sheet-components.js";
import {
  sheetFieldDefinitionSchema,
  targetLayoutMapSchema,
} from "./sheet-blueprints.js";
import { gameSystemSummarySchema, workspaceSheetSummarySchema } from "./game-systems.js";

export const createSheetDefinitionRequestSchema = z.object({
  systemId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  kind: z.enum(["character", "npc", "vehicle", "organization", "custom"]).default("character"),
  description: z.string().trim().max(2000).default(""),
});
export type CreateSheetDefinitionRequest = z.infer<
  typeof createSheetDefinitionRequestSchema
>;

export const updateSheetDefinitionRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    kind: z.enum(["character", "npc", "vehicle", "organization", "custom"]).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .refine((val) => Object.keys(val).length > 0);
export type UpdateSheetDefinitionRequest = z.infer<
  typeof updateSheetDefinitionRequestSchema
>;

export const autosaveSheetDraftRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  layouts: targetLayoutMapSchema,
  fields: z.array(sheetFieldDefinitionSchema).default([]),
});
export type AutosaveSheetDraftRequest = z.infer<
  typeof autosaveSheetDraftRequestSchema
>;

export const autosaveSheetDraftResponseSchema = z.object({
  revision: z.number().int().positive(),
  updatedAt: z.string(),
  valid: boolean(),
  validationErrors: z.array(z.string()).default([]),
});
export type AutosaveSheetDraftResponse = z.infer<
  typeof autosaveSheetDraftResponseSchema
>;

function boolean() {
  return z.boolean();
}

export const publishSheetVersionRequestSchema = z.object({
  changelog: z.string().trim().max(2000).default(""),
});
export type PublishSheetVersionRequest = z.infer<
  typeof publishSheetVersionRequestSchema
>;

export const publishSheetVersionResponseSchema = z.object({
  versionId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  publishedAt: z.string(),
});
export type PublishSheetVersionResponse = z.infer<
  typeof publishSheetVersionResponseSchema
>;

export const sheetVersionSummarySchema = z.object({
  id: z.string().uuid(),
  sheetDefinitionId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  changelog: z.string().default(""),
  publishedBy: z.string().uuid(),
  publishedAt: z.string(),
});
export type SheetVersionSummary = z.infer<
  typeof sheetVersionSummarySchema
>;

export const sheetEditorDataResponseSchema = z.object({
  sheetDefinition: workspaceSheetSummarySchema,
  system: gameSystemSummarySchema,
  draft: z.object({
    id: z.string().uuid(),
    schemaVersion: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
    layouts: targetLayoutMapSchema,
    fields: z.array(sheetFieldDefinitionSchema),
    updatedAt: z.string(),
  }),
  versions: z.array(sheetVersionSummarySchema),
  isOwner: z.boolean(),
});
export type SheetEditorDataResponse = z.infer<
  typeof sheetEditorDataResponseSchema
>;

// Component Library APIs
export const listComponentsQuerySchema = z.object({
  scope: componentScopeSchema.optional(),
  systemId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListComponentsQuery = z.infer<typeof listComponentsQuerySchema>;

export const listComponentsResponseSchema = z.object({
  components: z.array(componentSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
});
export type ListComponentsResponse = z.infer<
  typeof listComponentsResponseSchema
>;

export const createComponentRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  scope: componentScopeSchema.default("personal"),
  systemId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  layouts: targetLayoutMapSchema.optional(),
  exposedProperties: z.array(exposedPropertyDefinitionSchema).default([]),
});
export type CreateComponentRequest = z.infer<
  typeof createComponentRequestSchema
>;

export const autosaveComponentDraftRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  layouts: targetLayoutMapSchema,
  exposedProperties: z.array(exposedPropertyDefinitionSchema).default([]),
  dependencies: z.array(z.string().uuid()).default([]),
});
export type AutosaveComponentDraftRequest = z.infer<
  typeof autosaveComponentDraftRequestSchema
>;

export const autosaveComponentDraftResponseSchema = z.object({
  revision: z.number().int().positive(),
  updatedAt: z.string(),
  valid: z.boolean(),
  validationErrors: z.array(z.string()).default([]),
});
export type AutosaveComponentDraftResponse = z.infer<
  typeof autosaveComponentDraftResponseSchema
>;

export const publishComponentVersionRequestSchema = z.object({
  changelog: z.string().trim().max(2000).default(""),
});
export type PublishComponentVersionRequest = z.infer<
  typeof publishComponentVersionRequestSchema
>;

export const publishComponentVersionResponseSchema = z.object({
  versionId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  publishedAt: z.string(),
});
export type PublishComponentVersionResponse = z.infer<
  typeof publishComponentVersionResponseSchema
>;

export const forkComponentRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  scope: componentScopeSchema.default("personal"),
  systemId: z.string().uuid().nullable().optional(),
});
export type ForkComponentRequest = z.infer<
  typeof forkComponentRequestSchema
>;

export const componentVersionDetailsSchema = z.object({
  id: z.string().uuid(),
  componentId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  layouts: targetLayoutMapSchema,
  exposedProperties: z.array(exposedPropertyDefinitionSchema),
  dependencies: z.array(z.string().uuid()),
  changelog: z.string(),
  authorId: z.string().uuid(),
  createdAt: z.string(),
});
export type ComponentVersionDetails = z.infer<
  typeof componentVersionDetailsSchema
>;

export const generatePdfExportRequestSchema = z.object({
  characterId: z.string().uuid().optional(),
  sheetVersionId: z.string().uuid().optional(),
  target: z.enum(["print"]).default("print"),
});
export type GeneratePdfExportRequest = z.infer<
  typeof generatePdfExportRequestSchema
>;
