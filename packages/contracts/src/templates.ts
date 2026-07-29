import { z } from "zod";
import type { FieldDescriptor } from "./characters.js";

export const templateIdSchema = z.string().uuid();
export const templateScopeSchema = z.enum(["mine", "community", "creation"]);

export const updateTemplateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    gameSystem: z.string().trim().max(160).nullable().optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const updateTemplateFieldRequestSchema = z.object({
  label: z.string().trim().min(1).max(240),
  aliases: z.array(z.string().trim().min(1).max(240)).max(20),
  section: z.string().trim().max(240).nullable(),
  groupId: z.string().uuid().nullable(),
  groupOrder: z.number().int().nonnegative().nullable(),
  enabled: z.boolean(),
});

export const templateSummarySchema = z.object({
  id: templateIdSchema,
  title: z.string(),
  gameSystem: z.string().nullable(),
  pageCount: z.number().int().min(1).max(20),
  catalogStatus: z.enum(["pending", "processing", "ready", "partial", "failed"]),
  approvedAt: z.string().nullable(),
  updatedAt: z.string(),
  isPublic: z.boolean(),
  subscribed: z.boolean().optional(),
});

export type TemplateSummary = z.infer<typeof templateSummarySchema>;
export type TemplateScope = z.infer<typeof templateScopeSchema>;
export type UpdateTemplateRequest = z.infer<typeof updateTemplateRequestSchema>;
export type UpdateTemplateFieldRequest = z.infer<
  typeof updateTemplateFieldRequestSchema
>;

export interface TemplateField extends FieldDescriptor {
  enabled: boolean;
}

export interface TemplateEditorData extends TemplateSummary {
  fields: TemplateField[];
  pdfUrl: string;
}
