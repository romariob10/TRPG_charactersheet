import { ApiClientError } from "@/lib/api/client";
import { apiFetch } from "@/lib/api/server";
import type {
  PublicProfile,
  PublicCharacterSummary,
  TemplateComment,
  TemplateSummary,
} from "@/lib/types";
import type { SocialPost } from "@mycharacter/contracts";

export async function getCommunityTemplate(
  username: string,
  slug: string,
): Promise<TemplateSummary | null> {
  try {
    const { data } = await apiFetch<{ template: TemplateSummary }>(
      `/api/community/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
    );
    return data.template;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}

export async function getPublicProfile(username: string): Promise<{
  profile: PublicProfile;
  templates: TemplateSummary[];
  characters: PublicCharacterSummary[];
} | null> {
  try {
    const { data } = await apiFetch<{
      profile: PublicProfile;
      templates: TemplateSummary[];
      characters: PublicCharacterSummary[];
    }>(`/api/profiles/${encodeURIComponent(username)}`);
    return data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}

export async function getPublicCharacter(
  username: string,
  slug: string,
): Promise<PublicCharacterSummary | null> {
  try {
    const { data } = await apiFetch<{ character: PublicCharacterSummary }>(
      `/api/sheets/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
    );
    return data.character;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}

export async function getTemplateComments(
  templateId: string,
): Promise<{ items: TemplateComment[]; nextCursor: string | null }> {
  const { data } = await apiFetch<{
    items: TemplateComment[];
    nextCursor: string | null;
  }>(`/api/templates/${templateId}/comments?limit=20`);
  return data;
}

export async function getPublicPost(
  username: string,
  slug: string,
): Promise<SocialPost | null> {
  try {
    const { data } = await apiFetch<{ post: SocialPost }>(
      `/api/public/posts/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
    );
    return data.post;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}
