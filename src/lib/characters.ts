import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/auth";
import type {
  CharacterEditorData,
  CharacterField,
  FieldValue,
} from "@/lib/types";

interface EffectiveFieldRow {
  id: string;
  pdf_name: string;
  kind: CharacterField["kind"];
  label: string;
  aliases: string[] | null;
  section: string | null;
  page: number;
  options: string[] | null;
  group_id: string | null;
  group_order: number | null;
  confidence: number;
  source: CharacterField["source"];
}

export async function getCharacterEditorData(
  characterId: string,
): Promise<CharacterEditorData | null> {
  const { supabase, user } = await requireUser();
  const { data: character, error } = await supabase
    .from("characters")
    .select(
      "id,name,owner_id,revision,template_id,status,pdf_templates(catalog_status,storage_path)",
    )
    .eq("id", characterId)
    .single();
  if (error || !character || character.status !== "active") return null;

  const relation = character.pdf_templates;
  const template = (Array.isArray(relation)
    ? relation[0]
    : relation) as unknown as {
    catalog_status: CharacterEditorData["catalogStatus"];
    storage_path: string;
  } | null;
  if (!template) return null;
  const [{ data: fieldRows }, { data: valueRows }] = await Promise.all([
    supabase
      .from("effective_pdf_fields")
      .select(
        "id,pdf_name,kind,label,aliases,section,page,options,group_id,group_order,confidence,source",
      )
      .eq("template_id", character.template_id)
      .eq("is_enabled", true)
      .order("page")
      .order("group_order"),
    supabase
      .from("character_values")
      .select("field_id,value,version,updated_at,updated_by")
      .eq("character_id", characterId),
  ]);
  const fieldIds = (fieldRows ?? []).map((field) => field.id);
  const { data: widgetRows } = fieldIds.length
    ? await supabase
        .from("pdf_field_widgets")
        .select("id,field_id,page,rect,pdf_rect,rotation,export_value")
        .in("field_id", fieldIds)
    : { data: [] };
  const values = new Map((valueRows ?? []).map((row) => [row.field_id, row]));
  const widgets = new Map<string, NonNullable<CharacterField["widgets"]>>();
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

  const fields: CharacterField[] = (
    (fieldRows ?? []) as EffectiveFieldRow[]
  ).map((field) => {
    const value = values.get(field.id);
    return {
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
      widgets: widgets.get(field.id) ?? [],
      value: (value?.value ?? null) as FieldValue,
      version: value?.version ?? 0,
      updatedAt: value?.updated_at ?? new Date(0).toISOString(),
      updatedBy: value?.updated_by ?? null,
    };
  });

  const admin = createAdminClient();
  const { data: signed } = await admin.storage
    .from("character-pdfs")
    .createSignedUrl(template.storage_path, 600);
  return {
    id: character.id,
    name: character.name,
    role: character.owner_id === user.id ? "owner" : "editor",
    revision: character.revision,
    templateId: character.template_id,
    catalogStatus: template.catalog_status,
    fields,
    pdfUrl: signed?.signedUrl ?? "",
    currentUserId: user.id,
  };
}
