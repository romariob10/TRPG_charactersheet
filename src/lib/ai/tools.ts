import { z } from "zod";
import { defineTool } from "@copilotkit/runtime/v2";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiChangeSchema, fieldValueSchema } from "@/lib/schemas";
import type { FieldValue } from "@/lib/types";

interface ToolContext {
  characterId: string;
  templateId: string;
  userId: string;
}

async function loadFieldContext(context: ToolContext) {
  const admin = createAdminClient();
  const [{ data: fields }, { data: values }, { data: widgets }] =
    await Promise.all([
      admin
        .from("effective_pdf_fields")
        .select(
          "id,pdf_name,kind,label,aliases,section,page,options,group_id,group_order,confidence",
        )
        .eq("template_id", context.templateId)
        .eq("is_enabled", true),
      admin
        .from("character_values")
        .select("field_id,value,version")
        .eq("character_id", context.characterId),
      admin
        .from("pdf_field_widgets")
        .select("field_id,page,rect")
        .in(
          "field_id",
          (
            await admin
              .from("pdf_fields")
              .select("id")
              .eq("template_id", context.templateId)
              .eq("is_enabled", true)
          ).data?.map((field) => field.id) ?? [],
        ),
    ]);
  const valueMap = new Map(
    (values ?? []).map((value) => [value.field_id, value]),
  );
  return (fields ?? []).map((field) => {
    return {
      fieldId: field.id,
      technicalName: field.pdf_name,
      kind: field.kind,
      label: field.label,
      aliases: field.aliases ?? [],
      section: field.section,
      page: field.page,
      options: field.options ?? [],
      groupId: field.group_id,
      groupOrder: field.group_order,
      catalogConfidence: field.confidence,
      widgets: (widgets ?? [])
        .filter((widget) => widget.field_id === field.id)
        .map((widget) => ({ page: widget.page, rect: widget.rect })),
      value: (valueMap.get(field.id)?.value as FieldValue) ?? null,
      version: valueMap.get(field.id)?.version ?? 0,
    };
  });
}

export function createCharacterTools(context: ToolContext) {
  let fieldContextPromise: ReturnType<typeof loadFieldContext> | null = null;
  const getCachedFieldContext = () => {
    fieldContextPromise ??= loadFieldContext(context);
    return fieldContextPromise;
  };

  return [
    defineTool({
      name: "searchFields",
      description:
        "Search the character's PDF field catalog by human label, alias, technical name, section, page, or nearby field. Use this before proposing changes.",
      parameters: z.object({
        query: z.string().min(1).max(200),
        section: z.string().max(200).optional(),
        page: z.number().int().min(1).max(20).optional(),
        nearFieldId: z.string().uuid().optional(),
      }),
      execute: async ({ query, section, page, nearFieldId }) => {
        const all = await getCachedFieldContext();
        const normalized = query.toLocaleLowerCase();
        const near = nearFieldId
          ? all.find((field) => field.fieldId === nearFieldId)
          : null;
        return all
          .filter(
            (field) =>
              !section ||
              field.section
                ?.toLocaleLowerCase()
                .includes(section.toLocaleLowerCase()),
          )
          .filter((field) => !page || field.page === page)
          .map((field) => {
            const haystack =
              `${field.label} ${field.technicalName} ${field.section ?? ""} ${field.aliases.join(" ")}`.toLocaleLowerCase();
            let score =
              haystack === normalized
                ? 1
                : haystack.includes(normalized)
                  ? 0.8
                  : (normalized
                      .split(/\s+/)
                      .filter((part) => haystack.includes(part)).length /
                      Math.max(1, normalized.split(/\s+/).length)) *
                    0.65;
            if (near && field.page === near.page) score += 0.1;
            if (near && field.groupId && field.groupId === near.groupId)
              score += 0.25;
            return { ...field, score: Math.min(1, score) };
          })
          .filter((field) => field.score >= 0.22)
          .sort((a, b) => b.score - a.score)
          .slice(0, 12);
      },
    }),
    defineTool({
      name: "getFieldContext",
      description:
        "Read exact current values, versions, coordinates, and neighboring fields for known field IDs or one group.",
      parameters: z
        .object({
          fieldIds: z.array(z.string().uuid()).max(50).optional(),
          groupId: z.string().uuid().optional(),
        })
        .refine(
          (value) => Boolean(value.fieldIds?.length || value.groupId),
          "Provide fieldIds or groupId",
        ),
      execute: async ({ fieldIds, groupId }) => {
        const all = await getCachedFieldContext();
        return all
          .filter(
            (field) =>
              fieldIds?.includes(field.fieldId) ||
              (groupId && field.groupId === groupId),
          )
          .slice(0, 50);
      },
    }),
    defineTool({
      name: "proposeFieldChanges",
      description:
        "Create a user-reviewable proposal. This never writes character values. Use only field IDs returned by searchFields/getFieldContext and ask the user when confidence is low.",
      parameters: z.object({ changes: z.array(aiChangeSchema).min(1).max(50) }),
      execute: async ({ changes }) => {
        const all = await getCachedFieldContext();
        const byId = new Map(all.map((field) => [field.fieldId, field]));
        const valid = changes.filter((change) => {
          const field = byId.get(change.fieldId);
          if (!field || !fieldValueSchema.safeParse(change.value).success)
            return false;
          if (["button", "signature", "unknown"].includes(field.kind))
            return false;
          if (
            ["radio", "dropdown"].includes(field.kind) &&
            typeof change.value === "string" &&
            field.options.length &&
            !field.options.includes(change.value)
          )
            return false;
          return true;
        });
        if (valid.length !== changes.length)
          throw new Error("One or more proposed field changes are invalid");
        const admin = createAdminClient();
        const { data: proposal, error } = await admin
          .from("ai_proposals")
          .insert({
            character_id: context.characterId,
            user_id: context.userId,
          })
          .select("id,created_at")
          .single();
        if (error) throw error;
        const items = valid.map((change) => {
          const field = byId.get(change.fieldId)!;
          return {
            id: crypto.randomUUID(),
            proposal_id: proposal.id,
            field_id: change.fieldId,
            old_value: field.value,
            new_value: change.value,
            expected_version: field.version,
            reason: change.reason,
            confidence: change.confidence,
            label: field.label,
          };
        });
        const { error: itemError } = await admin
          .from("ai_proposal_items")
          .insert(
            items.map((item) => ({
              id: item.id,
              proposal_id: item.proposal_id,
              field_id: item.field_id,
              old_value: item.old_value,
              new_value: item.new_value,
              expected_version: item.expected_version,
              reason: item.reason,
              confidence: item.confidence,
            })),
          );
        if (itemError) throw itemError;
        return {
          proposal: {
            id: proposal.id,
            characterId: context.characterId,
            status: "pending",
            createdAt: proposal.created_at,
            items: items.map((item) => ({
              id: item.id,
              fieldId: item.field_id,
              label: item.label,
              oldValue: item.old_value,
              newValue: item.new_value,
              expectedVersion: item.expected_version,
              reason: item.reason,
              confidence: item.confidence,
            })),
          },
        };
      },
    }),
  ];
}
