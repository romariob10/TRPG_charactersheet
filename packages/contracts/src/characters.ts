import { z } from "zod";
import { publicAuthorSchema } from "./profiles.js";

export const characterIdSchema = z.string().uuid();
export const characterNameSchema = z.string().trim().min(1).max(120);

export const createCharacterRequestSchema = z.object({
  templateId: z.string().uuid(),
  name: characterNameSchema,
});

export const updateCharacterRequestSchema = z.object({
  name: characterNameSchema.optional(),
  isPublic: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

export const cloneCharacterRequestSchema = z.object({
  name: characterNameSchema.optional(),
});

export const acceptInvitationRequestSchema = z.object({
  token: z.string().min(16).max(512),
});

export const inviteUserRequestSchema = z
  .object({
    username: z.string().trim().min(1).max(80).optional(),
    userId: z.string().uuid().optional(),
  })
  .refine((data) => Boolean(data.username || data.userId), {
    message: "Either username or userId must be provided.",
  });
export type InviteUserRequest = z.infer<typeof inviteUserRequestSchema>;

export const fieldValueSchema = z.union([
  z.string().max(20_000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(2_000)).max(200),
  z.null(),
]);

export const fieldMutationRequestSchema = z.object({
  value: fieldValueSchema,
  expectedVersion: z.number().int().nonnegative(),
  clientMutationId: z.string().uuid(),
});

export const fieldMutationResponseSchema = z.object({
  value: fieldValueSchema,
  version: z.number().int().positive(),
  revision: z.number().int().positive(),
  overwrittenRemote: z.boolean(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid(),
});

export const characterSummarySchema = z.object({
  id: characterIdSchema,
  name: characterNameSchema,
  slug: z.string().optional(),
  isPublic: z.boolean().optional(),
  publishedAt: z.string().nullable().optional(),
  author: publicAuthorSchema.optional(),
  gameSystem: z.string().nullable().optional(),
  likeCount: z.number().int().nonnegative().optional(),
  likedByMe: z.boolean().optional(),
  role: z.enum(["owner", "editor"]),
  revision: z.number().int().nonnegative(),
  status: z.enum(["active", "trashed"]),
  catalogStatus: z.enum(["pending", "processing", "ready", "partial", "failed"]),
  pageCount: z.number().int().min(1).max(20),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type CharacterSummary = z.infer<typeof characterSummarySchema>;
export type CreateCharacterRequest = z.infer<typeof createCharacterRequestSchema>;
export type UpdateCharacterRequest = z.infer<typeof updateCharacterRequestSchema>;
export type FieldMutationRequest = z.infer<typeof fieldMutationRequestSchema>;
export type FieldMutationResponse = z.infer<typeof fieldMutationResponseSchema>;

export interface PublicCharacterSummary {
  id: string;
  name: string;
  slug: string;
  gameSystem: string | null;
  pageCount: number;
  updatedAt: string;
  publishedAt: string;
  author: z.infer<typeof publicAuthorSchema>;
  likeCount: number;
  likedByMe: boolean;
}

export type FieldValue = string | number | boolean | string[] | null;
export type FieldKind =
  | "text"
  | "multiline"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "list"
  | "button"
  | "signature"
  | "unknown";
export type CatalogSource = "pdf" | "heuristic" | "ocr" | "vision" | "manual";

export interface FieldWidget {
  id: string;
  page: number;
  rect: [number, number, number, number];
  pdfRect: [number, number, number, number];
  rotation: number;
  exportValue: string | null;
}

export interface FieldDescriptor {
  id: string;
  pdfName: string;
  kind: FieldKind;
  label: string;
  aliases: string[];
  section: string | null;
  page: number;
  options: string[];
  groupId: string | null;
  groupOrder: number | null;
  confidence: number;
  source: CatalogSource;
  widgets: FieldWidget[];
}

export interface CharacterField extends FieldDescriptor {
  value: FieldValue;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface CharacterEditorData {
  id: string;
  name: string;
  role: "owner" | "editor";
  revision: number;
  templateId: string;
  catalogStatus: CharacterSummary["catalogStatus"];
  fields: CharacterField[];
  pdfUrl: string;
  currentUserId: string;
}
