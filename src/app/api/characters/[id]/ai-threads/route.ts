import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: character, error: characterError } = await supabase
    .from("characters")
    .select("id")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  if (characterError) return NextResponse.json({ error: characterError.message }, { status: 500 });
  if (!character) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("ai_threads")
    .select("copilot_thread_id,title,created_at,updated_at")
    .eq("character_id", id)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    threads: (data ?? []).map((thread) => ({
      id: thread.copilot_thread_id,
      title: thread.title,
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
