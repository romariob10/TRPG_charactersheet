import { z } from "zod";
import { publicAuthorSchema } from "./profiles.js";

export const COMPONENT_SCOPES = ["personal", "system", "public", "curated"] as const;
export const componentScopeSchema = z.enum(COMPONENT_SCOPES);
export type ComponentScope = z.infer<typeof componentScopeSchema>;

export const EXPOSED_PROPERTY_TYPES = [
  "text",
  "fieldBinding",
  "visibility",
  "enumVariant",
  "number",
  "componentSwap",
  "styleToken",
] as const;
export const exposedPropertyTypeSchema = z.enum(EXPOSED_PROPERTY_TYPES);
export type ExposedPropertyType = z.infer<typeof exposedPropertyTypeSchema>;

export const exposedPropertyDefinitionSchema = z.object({
  propertyId: z.string().min(1).max(64),
  type: exposedPropertyTypeSchema,
  name: z.string().trim().min(1).max(64),
  label: z.string().trim().max(120).default(""),
  targetNodeId: z.string().uuid(),
  targetPropPath: z.string().trim().min(1).max(120),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  options: z.array(z.string().trim().max(120)).max(50).default([]),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
});
export type ExposedPropertyDefinition = z.infer<
  typeof exposedPropertyDefinitionSchema
>;

export const componentSummarySchema = z.object({
  id: z.string().uuid(),
  author: publicAuthorSchema.optional(),
  slug: z.string(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(""),
  scope: componentScopeSchema,
  systemId: z.string().uuid().nullable().optional(),
  systemTitle: z.string().nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  thumbnailUrl: z.string().nullable().optional(),
  currentVersionId: z.string().uuid().nullable().optional(),
  currentVersionNumber: z.number().int().positive().nullable().optional(),
  usageCount: z.number().int().nonnegative().default(0),
  isOwner: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ComponentSummary = z.infer<typeof componentSummarySchema>;

export const propertyOverrideValueSchema = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export type PropertyOverrideValue = z.infer<typeof propertyOverrideValueSchema>;
