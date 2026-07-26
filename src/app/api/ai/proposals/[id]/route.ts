import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("ai_proposals")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data)
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  return NextResponse.json({ status: data.status });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const body = (await request.json()) as { status?: string };
  if (body.status !== "rejected")
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const { error } = await supabase
    .from("ai_proposals")
    .update({ status: "rejected" })
    .eq("id", id)
    .eq("status", "pending");
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
