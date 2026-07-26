import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";
import { createCharacterSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  const parsed = createCharacterSchema.safeParse(await request.json());
  if (!parsed.success || !parsed.data.templateId)
    return NextResponse.json(
      { error: "Invalid character data" },
      { status: 400 },
    );
  const { data: template } = await supabase
    .from("pdf_templates")
    .select(
      "id,catalog_status,visibility,owner_id,catalog_approved_at,is_public,deleted_at",
    )
    .eq("id", parsed.data.templateId)
    .single();
  const baseAllowed =
    template?.visibility === "curated" || template?.owner_id === user.id;
  let communityAllowed = false;
  if (
    template?.visibility === "private" &&
    template.is_public &&
    template.owner_id !== user.id
  ) {
    const { data: subscription } = await supabase
      .from("template_subscriptions")
      .select("template_id")
      .eq("user_id", user.id)
      .eq("template_id", template.id)
      .maybeSingle();
    communityAllowed = Boolean(subscription);
  }
  if (
    !template ||
    template.deleted_at ||
    !template.catalog_approved_at ||
    !["ready", "partial"].includes(template.catalog_status) ||
    (!baseAllowed && !communityAllowed)
  )
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  const admin = createAdminClient();
  const { data: character, error } = await admin
    .from("characters")
    .insert({
      template_id: template.id,
      owner_id: user.id,
      name: parsed.data.name,
    })
    .select("id")
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: fields } = await admin
    .from("pdf_fields")
    .select("id,default_value")
    .eq("template_id", template.id)
    .eq("is_enabled", true);
  if (fields?.length)
    await admin.from("character_values").insert(
      fields.map((field) => ({
        character_id: character.id,
        field_id: field.id,
        value: field.default_value,
        version: 0,
        updated_by: user.id,
      })),
    );
  return NextResponse.json({ characterId: character.id }, { status: 201 });
}
