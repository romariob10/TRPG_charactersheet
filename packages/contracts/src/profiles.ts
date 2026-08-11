import { z } from "zod";

export const usernameSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{2,29}$/);

export const publicAuthorSchema = z.object({
  id: z.string().uuid(),
  username: usernameSchema,
  displayName: z.string().min(1).max(80).nullable(),
});

export const publicProfileSchema = z.object({
  username: usernameSchema,
  displayName: z.string().max(80).nullable(),
  bio: z.string().max(500),
  joinedAt: z.string(),
  publicTemplateCount: z.number().int().nonnegative(),
  totalLikes: z.number().int().nonnegative(),
});

export const myProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  username: usernameSchema,
  displayName: z.string().max(80).nullable(),
  bio: z.string().max(500),
  isAdmin: z.boolean(),
});

export const updateMyProfileRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).nullable().optional(),
    username: usernameSchema.optional(),
    bio: z.string().trim().max(500).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export type Username = z.infer<typeof usernameSchema>;
export type PublicAuthor = z.infer<typeof publicAuthorSchema>;
export type PublicProfile = z.infer<typeof publicProfileSchema>;
export type MyProfile = z.infer<typeof myProfileSchema>;
export type UpdateMyProfileRequest = z.infer<typeof updateMyProfileRequestSchema>;
