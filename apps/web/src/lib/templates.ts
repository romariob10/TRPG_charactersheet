import { ApiClientError } from "@/lib/api/client";
import { apiFetch } from "@/lib/api/server";
import type { TemplateEditorData } from "@/lib/types";

export async function getTemplateEditorData(
  templateId: string,
): Promise<TemplateEditorData | null> {
  try {
    return (
      await apiFetch<TemplateEditorData>(`/api/templates/${templateId}/editor`)
    ).data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}
