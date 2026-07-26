import { NextResponse } from "next/server";
import { templateFieldSchema } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
  const { id, fieldId } = await params;
  const { supabase, user } = await requireUser();
  const parsed = templateFieldSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: template } = await supabase
    .from("pdf_templates")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: field, error } = await admin
    .from("pdf_fields")
    .update({
      auto_label: parsed.data.label,
      auto_aliases: parsed.data.aliases,
      auto_section: parsed.data.section,
      auto_group_id: parsed.data.groupId,
      auto_group_order: parsed.data.groupOrder,
      is_enabled: parsed.data.enabled,
      confidence: 1,
      source: "manual",
    })
    .eq("id", fieldId)
    .eq("template_id", id)
    .select(
      "id,auto_label,auto_aliases,auto_section,auto_group_id,auto_group_order,is_enabled",
    )
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!field) {
    return NextResponse.json({ error: "Field not found" }, { status: 404 });
  }

  const { error: approvalError } = await admin
    .from("pdf_templates")
    .update({ catalog_approved_at: null, catalog_approved_by: null })
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null);
  if (approvalError) {
    return NextResponse.json({ error: approvalError.message }, { status: 400 });
  }

  return NextResponse.json({
    field: {
      id: field.id,
      label: field.auto_label,
      aliases: field.auto_aliases,
      section: field.auto_section,
      groupId: field.auto_group_id,
      groupOrder: field.auto_group_order,
      enabled: field.is_enabled,
    },
  });
}
