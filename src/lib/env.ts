import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().regex(
    /^sb_publishable_/,
    "Use a Supabase publishable key (sb_publishable_…), not the legacy anon key",
  ),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: z.string().regex(
    /^sb_secret_/,
    "Use a Supabase secret key (sb_secret_…), not the legacy service_role key",
  ),
});

export function getPublicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function getServerEnv() {
  return serverSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
}

export function getAiEnv() {
  return z
    .object({
      AI_BASE_URL: z.url(),
      AI_API_KEY: z.string().min(1),
      AI_PRIMARY_API_KEY: z.string().min(1).optional(),
      AI_CHAT_MODEL: z.string().min(1),
      AI_VISION_MODEL: z.string().min(1).optional(),
      AI_VISION_SUPPORTS_IMAGES: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
    })
    .safeParse({
      AI_BASE_URL: process.env.AI_BASE_URL,
      AI_API_KEY: process.env.AI_API_KEY,
      AI_PRIMARY_API_KEY: process.env.AI_PRIMARY_API_KEY,
      AI_CHAT_MODEL: process.env.AI_CHAT_MODEL,
      AI_VISION_MODEL: process.env.AI_VISION_MODEL,
      AI_VISION_SUPPORTS_IMAGES: process.env.AI_VISION_SUPPORTS_IMAGES,
    });
}
