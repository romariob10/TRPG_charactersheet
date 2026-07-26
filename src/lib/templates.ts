import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";
import type {
  CatalogSource,
  CatalogStatus,
  FieldKind,
  TemplateEditorData,
  TemplateField,
} from "@/lib/types";

interface TemplateFieldRow {
  id: string;
  pdf_name: string;
  kind: FieldKind;
  label: string;
  aliases: string[] | null;
  section: string | null;
  page: number;
  options: string[] | null;
  group_id: string | null;
  group_order: number | null;
  confidence: number;
  source: CatalogSource;
  is_enabled: boolean;
}

export async function getTemplateEditorData(
  templateId: string,
): Promise<TemplateEditorData | null> {
  const { supabase, user } = await requireUser();
  const { data: template, error } = await supabase
    .from("pdf_templates")
    .select(
      "id,title,game_system,page_count,catalog_status,catalog_approved_at,is_public,storage_path,updated_at",
    )
    .eq("id", templateId)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !template) return null;

  const { data: fieldRows, error: fieldsError } = await supabase
    .from("effective_pdf_fields")
    .select(
      "id,pdf_name,kind,label,aliases,section,page,options,group_id,group_order,confidence,source,is_enabled",
    )
    .eq("template_id", templateId)
    .order("page")
    .order("group_order");
  if (fieldsError) throw new Error(fieldsError.message);

  const fieldIds = (fieldRows ?? []).map((field) => field.id);
  const { data: widgetRows, error: widgetsError } = fieldIds.length
    ? await supabase
        .from("pdf_field_widgets")
        .select(
          "id,field_id,page,rect,pdf_rect,rotation,export_value,widget_index",
        )
        .in("field_id", fieldIds)
        .order("widget_index")
    : { data: [], error: null };
  if (widgetsError) throw new Error(widgetsError.message);

  const widgets = new Map<string, TemplateField["widgets"]>();
  for (const row of widgetRows ?? []) {
    widgets.set(row.field_id, [
      ...(widgets.get(row.field_id) ?? []),
      {
        id: row.id,
        page: row.page,
        rect: row.rect as [number, number, number, number],
        pdfRect: row.pdf_rect as [number, number, number, number],
        rotation: row.rotation,
        exportValue: row.export_value,
      },
    ]);
  }

  const fields: TemplateField[] = ((fieldRows ?? []) as TemplateFieldRow[]).map(
    (field) => ({
      id: field.id,
      pdfName: field.pdf_name,
      kind: field.kind,
      label: field.label,
      aliases: field.aliases ?? [],
      section: field.section,
      page: field.page,
      options: field.options ?? [],
      groupId: field.group_id,
      groupOrder: field.group_order,
      confidence: field.confidence,
      source: field.source,
      enabled: field.is_enabled,
      widgets: widgets.get(field.id) ?? [],
    }),
  );

  const admin = createAdminClient();
  const { data: signed } = await admin.storage
    .from("character-pdfs")
    .createSignedUrl(template.storage_path, 600);

  return {
    id: template.id,
    title: template.title,
    gameSystem: template.game_system,
    pageCount: template.page_count,
    catalogStatus: template.catalog_status as CatalogStatus,
    approvedAt: template.catalog_approved_at,
    updatedAt: template.updated_at,
    isPublic: template.is_public,
    fields,
    pdfUrl: signed?.signedUrl ?? "",
  };
}
