import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { templateApprovalSchema } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const parsed = templateApprovalSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid approval" }, { status: 400 });
  }

  const { data: template } = await supabase
    .from("pdf_templates")
    .select("id,catalog_status")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  if (!(["ready", "partial"] as string[]).includes(template.catalog_status)) {
    return NextResponse.json(
      { error: "Catalog is not ready" },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const { count, error: fieldsError } = await admin
    .from("pdf_fields")
    .select("id", { count: "exact", head: true })
    .eq("template_id", id)
    .eq("is_enabled", true);
  if (fieldsError) {
    return NextResponse.json({ error: fieldsError.message }, { status: 400 });
  }
  if (!count) {
    return NextResponse.json(
      { error: "Enable at least one field" },
      { status: 409 },
    );
  }

  const approvedAt = new Date().toISOString();
  const { error } = await admin
    .from("pdf_templates")
    .update({
      catalog_approved_at: approvedAt,
      catalog_approved_by: user.id,
    })
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  revalidatePath("/dashboard/systems");
  revalidatePath("/dashboard/new");
  return NextResponse.json({ approvedAt });
}
