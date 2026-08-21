import { z } from "zod";

export const directMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  body: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  isMine: z.boolean().optional(),
});
export type DirectMessage = z.infer<typeof directMessageSchema>;

export const directConversationSummarySchema = z.object({
  id: z.string().uuid(),
  participant: z.object({
    id: z.string().uuid(),
    username: z.string(),
    displayName: z.string().nullable(),
  }),
  lastMessage: z
    .object({
      body: z.string(),
      senderId: z.string().uuid(),
      createdAt: z.string(),
      readAt: z.string().nullable(),
    })
    .nullable(),
  unreadCount: z.number().int().nonnegative(),
  lastMessageAt: z.string(),
});
export type DirectConversationSummary = z.infer<typeof directConversationSummarySchema>;

export const listConversationsResponseSchema = z.object({
  conversations: z.array(directConversationSummarySchema),
});
export type ListConversationsResponse = z.infer<typeof listConversationsResponseSchema>;

export const sendMessageRequestSchema = z.object({
  body: z.string().min(1).max(2000),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const startConversationRequestSchema = z.object({
  recipientUsername: z.string().min(1),
  message: z.string().min(1).max(2000).optional(),
});
export type StartConversationRequest = z.infer<typeof startConversationRequestSchema>;
