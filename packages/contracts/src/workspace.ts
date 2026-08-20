import { z } from "zod";

export const workspaceItemKindSchema = z.enum([
  "post",
  "conversation",
  "character",
  "system",
]);
export type WorkspaceItemKind = z.infer<typeof workspaceItemKindSchema>;

export const workspaceItemSchema = z.object({
  id: z.string().uuid(),
  kind: workspaceItemKindSchema,
  targetId: z.string().uuid(),
  pinned: z.boolean(),
  unread: z.boolean(),
  lastActivityAt: z.string(),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  url: z.string().nullable(),
});
export type WorkspaceItem = z.infer<typeof workspaceItemSchema>;

export const listWorkspaceHistoryResponseSchema = z.object({
  items: z.array(workspaceItemSchema),
});
export type ListWorkspaceHistoryResponse = z.infer<
  typeof listWorkspaceHistoryResponseSchema
>;

export const pinWorkspaceItemRequestSchema = z.object({
  pinned: z.boolean(),
});
export type PinWorkspaceItemRequest = z.infer<
  typeof pinWorkspaceItemRequestSchema
>;
