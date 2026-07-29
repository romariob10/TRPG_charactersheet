"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { apiFetch } from "@/lib/api/server";
import { renameCharacterSchema } from "@/lib/schemas";

const characterIdSchema = z.string().uuid();

export async function cloneCharacter(formData: FormData) {
  const characterId = characterIdSchema.parse(
    String(formData.get("characterId") ?? ""),
  );
  const { data } = await apiFetch<{ id: string }>(
    `/api/characters/${characterId}/clone`,
    { method: "POST", body: "{}" },
  );
  redirect(`/characters/${data.id}`);
}

export async function trashCharacter(formData: FormData) {
  const characterId = characterIdSchema.parse(
    String(formData.get("characterId") ?? ""),
  );
  await apiFetch(`/api/characters/${characterId}/trash`, {
    method: "POST",
  });
  revalidatePath("/dashboard");
}

export async function restoreCharacter(formData: FormData) {
  const characterId = characterIdSchema.parse(
    String(formData.get("characterId") ?? ""),
  );
  await apiFetch(`/api/characters/${characterId}/restore`, {
    method: "POST",
  });
  revalidatePath("/dashboard");
}

export async function renameCharacter(formData: FormData) {
  const input = renameCharacterSchema.parse({
    characterId: String(formData.get("characterId") ?? ""),
    name: String(formData.get("name") ?? ""),
  });
  await apiFetch(`/api/characters/${input.characterId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: input.name }),
  });
  revalidatePath("/dashboard");
  revalidatePath(`/characters/${input.characterId}`);
}

export async function permanentlyDeleteCharacter(formData: FormData) {
  const characterId = characterIdSchema.parse(
    String(formData.get("characterId") ?? ""),
  );
  await apiFetch(`/api/characters/${characterId}`, { method: "DELETE" });
  revalidatePath("/dashboard");
}
