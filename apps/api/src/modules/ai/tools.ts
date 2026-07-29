import { defineTool } from "@copilotkit/runtime/v2";
import {
  aiChangeSchema,
  fieldValueSchema,
  type AiProposal,
  type FieldValue,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { z } from "zod";
import { AppError } from "../../errors.js";
import { validateFieldValue } from "../fields/value-validation.js";

interface ToolContext {
  database: Kysely<Database>;
  characterId: string;
  templateId: string;
  userId: string;
}

async function loadFieldContext(context: ToolContext) {
  const [fields, values, widgets] =
    await Promise.all([
      context.database
        .selectFrom("pdf_fields")
        .select([
          "id",
          "pdf_name as pdfName",
          "kind",
          "auto_label as label",
          "auto_aliases as aliases",
          "auto_section as section",
          "page",
          "options",
          "auto_group_id as groupId",
          "auto_group_order as groupOrder",
          "confidence",
        ])
        .where("template_id", "=", context.templateId)
        .where("is_enabled", "=", true)
        .execute(),
      context.database
        .selectFrom("character_values")
        .select(["field_id as fieldId", "value", "version"])
        .where("character_id", "=", context.characterId)
        .execute(),
      context.database
        .selectFrom("pdf_field_widgets as widget")
        .innerJoin("pdf_fields as field", "field.id", "widget.field_id")
        .select([
          "widget.field_id as fieldId",
          "widget.page",
          "widget.rect",
        ])
        .where("field.template_id", "=", context.templateId)
        .where("field.is_enabled", "=", true)
        .execute(),
    ]);
  const valueMap = new Map(
    values.map((value) => [value.fieldId, value]),
  );
  return fields.map((field) => {
    return {
      fieldId: field.id,
      technicalName: field.pdfName,
      kind: field.kind,
      label: field.label?.trim() || field.pdfName,
      aliases: field.aliases,
      section: field.section,
      page: field.page,
      options: stringArray(field.options),
      groupId: field.groupId,
      groupOrder: field.groupOrder,
      catalogConfidence: field.confidence,
      widgets: widgets
        .filter((widget) => widget.fieldId === field.id)
        .map((widget) => ({ page: widget.page, rect: widget.rect })),
      value: normalizeFieldValue(valueMap.get(field.id)?.value),
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
          if (
            !field ||
            change.expectedVersion !== field.version ||
            !fieldValueSchema.safeParse(change.value).success
          ) {
            return false;
          }
          try {
            validateFieldValue(field, change.value);
          } catch (error) {
            if (
              error instanceof AppError &&
              error.code === "FIELD_VALUE_INVALID"
            ) {
              return false;
            }
            throw error;
          }
          if (["button", "signature", "unknown"].includes(field.kind)) {
            return false;
          }
          return true;
        });
        if (valid.length !== changes.length)
          throw new Error("One or more proposed field changes are invalid");
        const proposal = await context.database.transaction().execute(
          async (trx) => {
            const created = await trx
              .insertInto("ai_proposals")
              .values({
                character_id: context.characterId,
                user_id: context.userId,
              })
              .returning(["id", "created_at as createdAt"])
              .executeTakeFirstOrThrow();
            const items = valid.map((change) => {
              const field = byId.get(change.fieldId)!;
              return {
                id: crypto.randomUUID(),
                proposalId: created.id,
                fieldId: change.fieldId,
                oldValue: field.value,
                newValue: change.value,
                expectedVersion: field.version,
                reason: change.reason,
                confidence: change.confidence,
                label: field.label,
              };
            });
            await trx
              .insertInto("ai_proposal_items")
              .values(
                items.map((item) => ({
                  id: item.id,
                  proposal_id: item.proposalId,
                  field_id: item.fieldId,
                  old_value: JSON.stringify(item.oldValue),
                  new_value: JSON.stringify(item.newValue),
                  expected_version: item.expectedVersion,
                  reason: item.reason,
                  confidence: item.confidence,
                })),
              )
              .execute();
            return {
              id: created.id,
              characterId: context.characterId,
              status: "pending" as const,
              createdAt: created.createdAt.toISOString(),
              items: items.map((item) => ({
                id: item.id,
                fieldId: item.fieldId,
                label: item.label,
                oldValue: item.oldValue,
                newValue: item.newValue,
                expectedVersion: item.expectedVersion,
                reason: item.reason,
                confidence: item.confidence,
              })),
            } satisfies AiProposal;
          },
        );
        return { proposal };
      },
    }),
  ];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeFieldValue(value: unknown): FieldValue {
  return fieldValueSchema.safeParse(value ?? null).success
    ? (value ?? null) as FieldValue
    : null;
}
