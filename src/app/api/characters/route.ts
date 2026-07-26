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
  const name = String(formData.get("name") ?? "").trim();
  const allowVision = formData.get("allowVision") === "true";

  if (!(file instanceof File) || !name || name.length > 120) {
    return NextResponse.json(
      { error: "Invalid character data." },
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
    .select("id,catalog_status")
    .eq("owner_id", user.id)
    .eq("sha256", sha256)
    .eq("visibility", "private")
    .is("deleted_at", null)
    .maybeSingle();

  if (existingTemplate) {
    const { data: character, error: characterError } = await admin
      .from("characters")
      .insert({ template_id: existingTemplate.id, owner_id: user.id, name })
      .select("id")
      .single();
    if (characterError)
      return NextResponse.json(
        { error: characterError.message },
        { status: 500 },
      );

    const { data: fields } = await admin
      .from("pdf_fields")
      .select("id,default_value")
      .eq("template_id", existingTemplate.id)
      .eq("is_enabled", true);
    if (fields?.length) {
      await admin.from("character_values").insert(
        fields.map((field) => ({
          character_id: character.id,
          field_id: field.id,
          value: field.default_value,
          version: 0,
          updated_by: user.id,
        })),
      );
    }
    return NextResponse.json({ characterId: character.id }, { status: 201 });
  }

  const templateId = randomUUID();
  const storagePath = `${user.id}/${templateId}/source.pdf`;
  const { error: uploadError } = await admin.storage
    .from("character-pdfs")
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { error: templateError } = await admin.from("pdf_templates").insert({
    id: templateId,
    owner_id: user.id,
    visibility: "private",
    title: file.name.replace(/\.pdf$/i, "") || name,
    storage_path: storagePath,
    sha256,
    page_count: pageCount,
    allow_vision: allowVision,
    catalog_status: "pending",
  });
  if (templateError) {
    await admin.storage.from("character-pdfs").remove([storagePath]);
    return NextResponse.json({ error: templateError.message }, { status: 500 });
  }

  const { data: character, error: characterError } = await admin
    .from("characters")
    .insert({ template_id: templateId, owner_id: user.id, name })
    .select("id")
    .single();
  if (characterError)
    return NextResponse.json(
      { error: characterError.message },
      { status: 500 },
    );

  const { data: job } = await admin
    .from("catalog_jobs")
    .insert({ template_id: templateId, current_step: "queued", progress: 0 })
    .select("id")
    .single();

  try {
    await inngest.send({
      name: "catalog/requested",
      data: {
        templateId,
        characterId: character.id,
        userId: user.id,
        jobId: job?.id,
      },
    });
  } catch (error) {
    await admin
      .from("catalog_jobs")
      .update({
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Failed to enqueue catalog job",
      })
      .eq("id", job?.id ?? "");
    await admin
      .from("pdf_templates")
      .update({ catalog_status: "failed" })
      .eq("id", templateId);
  }

  return NextResponse.json({ characterId: character.id }, { status: 201 });
}
