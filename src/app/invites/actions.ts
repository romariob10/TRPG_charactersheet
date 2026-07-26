"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("accept_character_invite", { p_token_hash: tokenHash });
  if (error) redirect(`/invites/${token}?error=${encodeURIComponent(error.message)}`);
  redirect(`/characters/${data}`);
}
