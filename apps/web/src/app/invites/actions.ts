"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api/server";

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    const { data } = await apiFetch<{ characterId: string }>(
      "/api/invitations/accept",
      { method: "POST", body: JSON.stringify({ token }) },
    );
    redirect(`/characters/${data.characterId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_invite";
    redirect(`/invites/${token}?error=${encodeURIComponent(message)}`);
  }
}
