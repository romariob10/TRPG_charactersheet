import { z } from "zod";
import { siteRoleSchema } from "./roles.js";

export const usernameSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{2,29}$/);

export const publicAuthorSchema = z.object({
  id: z.string().uuid(),
  username: usernameSchema,
  displayName: z.string().min(1).max(80).nullable(),
});

export const feedAuthorsResponseSchema = z.object({
  popular: z.array(publicAuthorSchema).max(5),
  following: z.array(publicAuthorSchema),
});

export const publicProfileSchema = z.object({
  id: z.string().uuid(),
  username: usernameSchema,
  displayName: z.string().max(80).nullable(),
  bio: z.string().max(500),
  joinedAt: z.string(),
  publicTemplateCount: z.number().int().nonnegative(),
  publicCharacterCount: z.number().int().nonnegative(),
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
  followedByMe: z.boolean(),
  totalLikes: z.number().int().nonnegative(),
  allowComments: z.boolean().default(true),
  showCharacters: z.boolean().default(true),
  showTemplates: z.boolean().default(true),
  showActivity: z.boolean().default(true),
});

export const myProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  username: usernameSchema,
  displayName: z.string().max(80).nullable(),
  bio: z.string().max(500),
  isAdmin: z.boolean(),
  siteRole: siteRoleSchema.default("user"),
  allowComments: z.boolean().default(true),
  showCharacters: z.boolean().default(true),
  showTemplates: z.boolean().default(true),
  showActivity: z.boolean().default(true),
});

export const updateMyProfileRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).nullable().optional(),
    username: usernameSchema.optional(),
    bio: z.string().trim().max(500).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const updateProfilePrivacyRequestSchema = z.object({
  allowComments: z.boolean().optional(),
  showCharacters: z.boolean().optional(),
  showTemplates: z.boolean().optional(),
  showActivity: z.boolean().optional(),
});

export type Username = z.infer<typeof usernameSchema>;
export type PublicAuthor = z.infer<typeof publicAuthorSchema>;
export type FeedAuthorsResponse = z.infer<typeof feedAuthorsResponseSchema>;
export type PublicProfile = z.infer<typeof publicProfileSchema>;
export type MyProfile = z.infer<typeof myProfileSchema>;
export type UpdateMyProfileRequest = z.infer<typeof updateMyProfileRequestSchema>;
export type UpdateProfilePrivacyRequest = z.infer<typeof updateProfilePrivacyRequestSchema>;

export const friendSummarySchema = z.object({
  id: z.string().uuid(),
  username: usernameSchema,
  displayName: z.string().max(80).nullable(),
});
export type FriendSummary = z.infer<typeof friendSummarySchema>;

export const listFriendsResponseSchema = z.object({
  items: z.array(friendSummarySchema),
});
export type ListFriendsResponse = z.infer<typeof listFriendsResponseSchema>;
