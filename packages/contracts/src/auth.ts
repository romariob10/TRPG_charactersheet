import { z } from "zod";

export const authEmailSchema = z.string().trim().toLowerCase().email().max(320);
export const authPasswordSchema = z.string().min(12).max(512);

export const registerRequestSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema,
});

export const loginRequestSchema = registerRequestSchema;

export const changePasswordRequestSchema = z.object({
  currentPassword: authPasswordSchema,
  newPassword: authPasswordSchema,
});

export const passwordResetRequestSchema = z.object({
  email: authEmailSchema,
});

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: authEmailSchema,
});

export const authUserResponseSchema = z.object({
  user: authUserSchema,
});

export type AuthUser = z.infer<typeof authUserSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
