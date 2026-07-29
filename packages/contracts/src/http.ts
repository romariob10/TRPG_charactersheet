import { z } from "zod";

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
    message: z.string(),
    requestId: z.string().min(1),
    details: z.unknown().optional(),
  }),
});

export const ApiErrorSchema = apiErrorSchema;

export type ApiError = z.infer<typeof apiErrorSchema>;
