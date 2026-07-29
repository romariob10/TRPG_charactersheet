import { ApiClientError } from "@/lib/api/client";
import { apiFetch } from "@/lib/api/server";
import type { CharacterEditorData } from "@/lib/types";

export async function getCharacterEditorData(
  characterId: string,
): Promise<CharacterEditorData | null> {
  try {
    return (
      await apiFetch<CharacterEditorData>(
        `/api/characters/${characterId}/editor`,
      )
    ).data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}
