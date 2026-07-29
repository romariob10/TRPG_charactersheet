import { z } from "zod";
import { fieldValueSchema, type FieldValue } from "./characters.js";

export const aiChangeSchema = z.object({
  fieldId: z.uuid(),
  value: fieldValueSchema,
  reason: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1),
  expectedVersion: z.number().int().min(0),
});

export const applyProposalSchema = z.object({
  proposalId: z.uuid(),
  items: z
    .array(
      z.object({
        itemId: z.uuid(),
        value: fieldValueSchema,
      }),
    )
    .min(1)
    .max(200),
});

export const rejectProposalSchema = z.object({
  status: z.literal("rejected"),
});

export type AiProposalStatus = "pending" | "applied" | "rejected" | "expired";

export interface AiProposalItem {
  id: string;
  fieldId: string;
  label: string;
  oldValue: FieldValue;
  newValue: FieldValue;
  expectedVersion: number;
  reason: string;
  confidence: number;
}

export interface AiProposal {
  id: string;
  characterId: string;
  status: AiProposalStatus;
  items: AiProposalItem[];
  createdAt: string;
}

export interface AiAppliedChange {
  itemId: string;
  fieldId: string;
  value: FieldValue;
  version: number;
  revision: number;
  updatedBy: string;
}

export interface AiProposalConflict {
  itemId: string;
  fieldId: string;
  reason: "version_conflict" | "invalid_value";
  currentVersion?: number;
}

export interface ApplyProposalResponse {
  applied: AiAppliedChange[];
  conflicts: AiProposalConflict[];
}
