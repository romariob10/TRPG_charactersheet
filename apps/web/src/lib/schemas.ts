import { z } from "zod";

export const fieldValueSchema = z.union([
  z.string().max(20_000),
  z.boolean(),
  z.array(z.string().max(2_000)).max(200),
  z.null(),
]);

export const fieldMutationSchema = z.object({
  value: fieldValueSchema,
  expectedVersion: z.number().int().min(0),
  clientMutationId: z.uuid(),
});

export const createCharacterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  templateId: z.uuid().optional(),
  allowVision: z.boolean().default(false),
});

export const renameCharacterSchema = z.object({
  characterId: z.uuid(),
  name: z.string().trim().min(1).max(120),
});

export const catalogFieldSchema = z.object({
  label: z.string().trim().min(1).max(240),
  aliases: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
  section: z.string().trim().max(240).nullable(),
  groupId: z.uuid().nullable(),
  groupOrder: z.number().int().min(0).nullable(),
});

export const templateFieldSchema = catalogFieldSchema.extend({
  enabled: z.boolean(),
});

export const templateApprovalSchema = z.object({
  approved: z.literal(true),
});

export const templateSettingsSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    gameSystem: z.string().trim().min(1).max(160).optional(),
    isPublic: z.boolean().optional(),
  })
  .refine(
    (settings) => Object.values(settings).some((value) => value !== undefined),
    { message: "At least one template setting is required." },
  );

export const aiChangeSchema = z.object({
  fieldId: z.uuid(),
  value: fieldValueSchema,
  reason: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1),
  expectedVersion: z.number().int().min(0),
});

export const applyProposalSchema = z.object({
  proposalId: z.uuid(),
  items: z
    .array(
      z.object({
        itemId: z.uuid(),
        value: fieldValueSchema,
      }),
    )
    .min(1)
    .max(200),
});

export const inviteSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export const visionCatalogSchema = z.object({
  fields: z.array(
    z.object({
      fieldId: z.uuid(),
      label: z.string().trim().min(1).max(240),
      section: z.string().trim().max(240).nullable(),
      groupKey: z.string().trim().max(160).nullable(),
      groupOrder: z.number().int().min(0).nullable(),
      evidence: z.array(z.string().max(240)).max(8),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
