"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/auth";
import { renameCharacterSchema } from "@/lib/schemas";

const characterIdSchema = z.string().uuid();

export async function cloneCharacter(formData: FormData) {
  const { supabase } = await requireUser();
  const characterId = String(formData.get("characterId") ?? "");
  const { data, error } = await supabase.rpc("clone_character", {
    p_character_id: characterId,
  });
  if (error) throw new Error(error.message);
  redirect(`/characters/${data}`);
}

export async function trashCharacter(formData: FormData) {
  const { supabase } = await requireUser();
  const characterId = String(formData.get("characterId") ?? "");
  const { error } = await supabase.rpc("set_character_trashed", {
    p_character_id: characterId,
    p_trashed: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function restoreCharacter(formData: FormData) {
  const { supabase } = await requireUser();
  const characterId = String(formData.get("characterId") ?? "");
  const { error } = await supabase.rpc("set_character_trashed", {
    p_character_id: characterId,
    p_trashed: false,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function renameCharacter(formData: FormData) {
  const { supabase, user } = await requireUser();
  const input = renameCharacterSchema.parse({
    characterId: String(formData.get("characterId") ?? ""),
    name: String(formData.get("name") ?? ""),
  });
  const { data, error } = await supabase
    .from("characters")
    .update({ name: input.name })
    .eq("id", input.characterId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("character_not_found_or_forbidden");
  revalidatePath("/dashboard");
  revalidatePath(`/characters/${input.characterId}`);
}

export async function permanentlyDeleteCharacter(formData: FormData) {
  const { supabase, user } = await requireUser();
  const characterId = characterIdSchema.parse(
    String(formData.get("characterId") ?? ""),
  );

  const { data: deletedCharacter, error: deleteError } = await supabase
    .from("characters")
    .delete()
    .eq("id", characterId)
    .eq("owner_id", user.id)
    .eq("status", "trashed")
    .select("id")
    .maybeSingle();
  if (deleteError) throw new Error(deleteError.message);
  if (!deletedCharacter) throw new Error("character_not_found_or_not_trashed");

  revalidatePath("/dashboard");
}
