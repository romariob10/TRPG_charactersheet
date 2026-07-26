import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";
import { templateSettingsSchema } from "@/lib/schemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const parsed = templateSettingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid template settings." },
      { status: 400 },
    );
  }

  const { data: template } = await supabase
    .from("pdf_templates")
    .select("id,owner_id,deleted_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const update: {
    title?: string;
    game_system?: string;
    is_public?: boolean;
  } = {};
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.gameSystem !== undefined)
    update.game_system = parsed.data.gameSystem;
  if (parsed.data.isPublic !== undefined)
    update.is_public = parsed.data.isPublic;

  const { data: updated, error } = await supabase
    .from("pdf_templates")
    .update(update)
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .select("title,game_system,is_public")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (parsed.data.isPublic === false) {
    const admin = createAdminClient();
    await admin.from("template_subscriptions").delete().eq("template_id", id);
  }

  return NextResponse.json({
    template: {
      title: updated.title,
      gameSystem: updated.game_system,
      isPublic: updated.is_public,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: template } = await supabase
    .from("pdf_templates")
    .select("id,owner_id,storage_path,deleted_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { count, error: countError } = await admin
    .from("characters")
    .select("id", { count: "exact", head: true })
    .eq("template_id", id);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("pdf_templates")
      .update({ deleted_at: new Date().toISOString(), is_public: false })
      .eq("id", id)
      .eq("owner_id", user.id)
      .is("deleted_at", null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    await admin.from("template_subscriptions").delete().eq("template_id", id);
    return NextResponse.json({ deleted: true, retainedForCharacters: true });
  }

  const { error: deleteError } = await supabase
    .from("pdf_templates")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  const { error: storageError } = await admin.storage
    .from("character-pdfs")
    .remove([template.storage_path]);
  if (storageError) {
    console.error("[template-delete] storage cleanup failed", {
      templateId: id,
      message: storageError.message,
    });
  }
  return NextResponse.json({ deleted: true, retainedForCharacters: false });
}
