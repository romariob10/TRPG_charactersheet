import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { inviteSchema } from "@/lib/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const parsed = inviteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { data: character } = await supabase.from("characters").select("owner_id").eq("id", id).single();
  if (!character || character.owner_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 86_400_000).toISOString();
  const { error } = await supabase.from("character_invites").insert({
    character_id: id,
    token_hash: tokenHash,
    created_by: user.id,
    expires_at: expiresAt,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  return NextResponse.json({ url: `${origin}/invites/${token}`, expiresAt });
}
