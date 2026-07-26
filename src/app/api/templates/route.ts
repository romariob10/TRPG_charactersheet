import { createHash, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE = 25 * 1024 * 1024;
const MAX_PAGES = 20;

export async function POST(request: Request) {
  const { user } = await requireUser();
  const formData = await request.formData();
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim();
  const gameSystem = String(formData.get("gameSystem") ?? "").trim();
  const allowVision = formData.get("allowVision") === "true";
  const isPublic = formData.get("publishCommunity") === "true";
  const forceDuplicate = formData.get("forceDuplicate") === "true";

  if (
    !(file instanceof File) ||
    !title ||
    title.length > 160 ||
    !gameSystem ||
    gameSystem.length > 160
  ) {
    return NextResponse.json(
      { error: "Invalid template data." },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "PDF is larger than 25 MB." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    return NextResponse.json(
      { error: "The uploaded file is not a PDF." },
      { status: 415 },
    );
  }

  let pageCount = 0;
  try {
    const document = await PDFDocument.load(bytes);
    pageCount = document.getPageCount();
    if (pageCount > MAX_PAGES) {
      return NextResponse.json(
        { error: `PDF has more than ${MAX_PAGES} pages.` },
        { status: 400 },
      );
    }
    if (document.getForm().getFields().length === 0) {
      return NextResponse.json(
        { error: "PDF does not contain AcroForm fields." },
        { status: 400 },
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF cannot be opened.";
    return NextResponse.json(
      {
        error: message.toLowerCase().includes("encrypt")
          ? "Encrypted PDFs are not supported."
          : message,
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { data: existingTemplate } = await admin
    .from("pdf_templates")
    .select("id")
    .eq("owner_id", user.id)
    .eq("sha256", sha256)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingTemplate) {
    return NextResponse.json(
      { templateId: existingTemplate.id, existing: true },
      { status: 200 },
    );
  }

  if (!forceDuplicate) {
    const { data: communityTemplate } = await admin
      .from("pdf_templates")
      .select("id,title,game_system,page_count")
      .eq("visibility", "private")
      .eq("is_public", true)
      .eq("sha256", sha256)
      .is("deleted_at", null)
      .neq("owner_id", user.id)
      .in("catalog_status", ["ready", "partial"])
      .not("catalog_approved_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (communityTemplate) {
      const { data: subscription } = await admin
        .from("template_subscriptions")
        .select("template_id")
        .eq("user_id", user.id)
        .eq("template_id", communityTemplate.id)
        .maybeSingle();
      return NextResponse.json(
        {
          error: "A community mapping already exists for this PDF.",
          duplicateCommunity: {
            id: communityTemplate.id,
            title: communityTemplate.title,
            gameSystem: communityTemplate.game_system,
            pageCount: communityTemplate.page_count,
            subscribed: Boolean(subscription),
          },
        },
        { status: 409 },
      );
    }
  }

  const templateId = randomUUID();
  const storagePath = `${user.id}/${templateId}/source.pdf`;
  const { error: uploadError } = await admin.storage
    .from("character-pdfs")
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { error: templateError } = await admin.from("pdf_templates").insert({
    id: templateId,
    owner_id: user.id,
    visibility: "private",
    title,
    game_system: gameSystem,
    storage_path: storagePath,
    sha256,
    page_count: pageCount,
    allow_vision: allowVision,
    catalog_status: "pending",
    is_public: isPublic,
  });
  if (templateError) {
    await admin.storage.from("character-pdfs").remove([storagePath]);
    return NextResponse.json({ error: templateError.message }, { status: 500 });
  }

  const { data: job, error: jobError } = await admin
    .from("catalog_jobs")
    .insert({
      template_id: templateId,
      current_step: "queued",
      progress: 0,
    })
    .select("id")
    .single();
  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 });
  }

  try {
    await inngest.send({
      name: "catalog/requested",
      data: { templateId, userId: user.id, jobId: job.id },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to enqueue catalog job";
    await admin
      .from("catalog_jobs")
      .update({ status: "failed", error: message })
      .eq("id", job.id);
    await admin
      .from("pdf_templates")
      .update({ catalog_status: "failed", catalog_error: message })
      .eq("id", templateId);
  }

  return NextResponse.json({ templateId }, { status: 201 });
}
