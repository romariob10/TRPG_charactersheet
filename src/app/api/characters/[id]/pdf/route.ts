import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: character } = await supabase.from("characters").select("template_id,pdf_templates(storage_path)").eq("id", id).single();
  const relation = character?.pdf_templates;
  const template = (Array.isArray(relation) ? relation[0] : relation) as { storage_path: string } | null | undefined;
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("character-pdfs").createSignedUrl(template.storage_path, 600);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
