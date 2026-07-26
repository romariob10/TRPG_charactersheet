import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: template } = await supabase
    .from("pdf_templates")
    .select(
      "id,owner_id,visibility,is_public,catalog_status,catalog_approved_at,deleted_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (
    !template ||
    template.deleted_at ||
    template.owner_id === user.id ||
    template.visibility !== "private" ||
    !template.is_public ||
    !template.catalog_approved_at ||
    !["ready", "partial"].includes(template.catalog_status)
  ) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const { error } = await supabase.from("template_subscriptions").insert({
    user_id: user.id,
    template_id: template.id,
  });
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(
    { templateId: template.id, subscribed: true },
    { status: error?.code === "23505" ? 200 : 201 },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("template_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("template_id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ templateId: id, subscribed: false });
}
