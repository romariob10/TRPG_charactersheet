import { z } from "zod";

export const JOB_NAMES = {
  catalogTemplate: "catalog-template",
  purgeTrash: "purge-trash",
  reconcileStorage: "reconcile-storage",
} as const;

export const catalogJobPayloadSchema = z.object({
  templateId: z.string().uuid(),
  catalogJobId: z.string().uuid(),
});

export type CatalogJobPayload = z.infer<typeof catalogJobPayloadSchema>;
