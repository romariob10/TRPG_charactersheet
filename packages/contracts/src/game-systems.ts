import { z } from "zod";
import { publicAuthorSchema } from "./profiles.js";
import { systemMaterialSchema, workspaceCharacterSchema, workspacePostSchema } from "./system-workspace.js";

export const gameSystemIdSchema = z.string().uuid();
export const gameSystemSlugSchema = z.string().trim().min(1).max(160);

export const createGameSystemRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).default(""),
  family: z.string().trim().max(120).optional(),
  edition: z.string().trim().max(120).optional(),
  visibility: z.enum(["private", "public"]).default("private"),
});
export type CreateGameSystemRequest = z.infer<
  typeof createGameSystemRequestSchema
>;

export const updateGameSystemRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(5000).optional(),
    family: z.string().trim().max(120).nullable().optional(),
    edition: z.string().trim().max(120).nullable().optional(),
    visibility: z.enum(["private", "public"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export type UpdateGameSystemRequest = z.infer<
  typeof updateGameSystemRequestSchema
>;

export const gameSystemSummarySchema = z.object({
  id: gameSystemIdSchema,
  slug: gameSystemSlugSchema,
  title: z.string(),
  description: z.string().default(""),
  family: z.string().nullable().optional(),
  edition: z.string().nullable().optional(),
  visibility: z.enum(["private", "public"]),
  owner: publicAuthorSchema.optional(),
  isOwner: z.boolean().optional(),
  sheetCount: z.number().int().nonnegative().default(0),
  characterCount: z.number().int().nonnegative().default(0),
  materialCount: z.number().int().nonnegative().default(0),
  postCount: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GameSystemSummary = z.infer<typeof gameSystemSummarySchema>;

export const sheetKindSchema = z.enum(["character", "npc", "vehicle", "organization", "custom"]);
export type SheetKind = z.infer<typeof sheetKindSchema>;

export const workspaceSheetSummarySchema = z.object({
  id: z.string().uuid(),
  systemId: z.string().uuid().optional(),
  title: z.string(),
  slug: z.string().optional(),
  description: z.string().optional().default(""),
  kind: sheetKindSchema.default("character"),
  currentVersionId: z.string().uuid().nullable().optional(),
  currentVersionNumber: z.number().int().positive().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string(),
});
export type WorkspaceSheetSummary = z.infer<
  typeof workspaceSheetSummarySchema
>;

export const unifiedGameSystemWorkspaceSchema = z.object({
  system: gameSystemSummarySchema,
  sheets: z.array(workspaceSheetSummarySchema).default([]),
  characters: z.array(workspaceCharacterSchema).default([]),
  materials: z.array(systemMaterialSchema).default([]),
  posts: z.array(workspacePostSchema).default([]),
  isOwner: z.boolean(),
});
export type UnifiedGameSystemWorkspace = z.infer<
  typeof unifiedGameSystemWorkspaceSchema
>;
