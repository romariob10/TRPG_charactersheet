import { z } from "zod";

export const materialFileTypeSchema = z.enum(["pdf", "image"]);
export type MaterialFileType = z.infer<typeof materialFileTypeSchema>;

export const systemMaterialSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  title: z.string(),
  fileType: materialFileTypeSchema,
  sizeBytes: z.number().int().nonnegative(),
  url: z.string(),
  createdAt: z.string(),
});
export type SystemMaterial = z.infer<typeof systemMaterialSchema>;

export const listSystemMaterialsResponseSchema = z.object({
  materials: z.array(systemMaterialSchema),
});
export type ListSystemMaterialsResponse = z.infer<
  typeof listSystemMaterialsResponseSchema
>;

export const workspaceCharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  isPublic: z.boolean(),
});
export type WorkspaceCharacter = z.infer<typeof workspaceCharacterSchema>;

export const workspacePostSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  excerpt: z.string(),
  authorUsername: z.string(),
  slug: z.string(),
  createdAt: z.string(),
});
export type WorkspacePost = z.infer<typeof workspacePostSchema>;

import { workspaceSheetSummarySchema } from "./game-systems.js";

export const systemWorkspaceResponseSchema = z.object({
  system: z.object({
    id: z.string().uuid(),
    title: z.string(),
    gameSystem: z.string().nullable(),
    isOwner: z.boolean(),
  }),
  characters: z.array(workspaceCharacterSchema),
  posts: z.array(workspacePostSchema),
  materials: z.array(systemMaterialSchema),
  sheets: z.array(workspaceSheetSummarySchema).default([]),
});
export type SystemWorkspaceResponse = z.infer<
  typeof systemWorkspaceResponseSchema
>;

export const filePostRequestSchema = z.object({
  systemId: z.string().uuid().nullable(),
});
export type FilePostRequest = z.infer<typeof filePostRequestSchema>;
