import { randomUUID } from "node:crypto";
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assignLabels,
  assignSpatialGroups,
  extractPdfCatalog,
  type TextToken,
} from "@/lib/pdf/catalog";
import { recognizePage } from "@/lib/pdf/ocr";
import { renderPdfPage } from "@/lib/pdf/render";
import { analyzePageWithVision } from "@/lib/pdf/vision";
import { createConfiguredProvider } from "@/lib/ai/provider";

async function downloadTemplate(templateId: string) {
  const admin = createAdminClient();
  const { data: template, error } = await admin
    .from("pdf_templates")
    .select("id,storage_path,page_count,allow_vision")
    .eq("id", templateId)
    .single();
  if (error) throw error;
  const { data: blob, error: downloadError } = await admin.storage
    .from("character-pdfs")
    .download(template.storage_path);
  if (downloadError) throw downloadError;
  return { template, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

async function updateProgress(
  jobId: string | undefined,
  templateId: string,
  stepName: string,
  progress: number,
) {
  const admin = createAdminClient();
  if (jobId) {
    await admin
      .from("catalog_jobs")
      .update({
        status: "processing",
        current_step: stepName,
        progress,
        started_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
  await admin
    .from("pdf_templates")
    .update({ catalog_status: "processing" })
    .eq("id", templateId);
}

async function markCatalogFailed(
  jobId: string | undefined,
  templateId: string,
  error: Error,
) {
  const admin = createAdminClient();
  const message = (error.message || "PDF catalog job failed").slice(0, 2_000);
  await admin
    .from("pdf_templates")
    .update({
      catalog_status: "failed",
      catalog_error: message,
    })
    .eq("id", templateId);
  if (jobId) {
    await admin
      .from("catalog_jobs")
      .update({
        status: "failed",
        current_step: "failed",
        progress: 100,
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

export const catalogPdf = inngest.createFunction(
  {
    id: "catalog-pdf",
    retries: 3,
    triggers: [{ event: "catalog/requested" }],
    concurrency: [{ limit: 2, key: "event.data.userId" }],
    onFailure: async ({ event, error }) => {
      const originalEvent = event.data.event;
      const { templateId, jobId } = originalEvent.data as {
        templateId: string;
        jobId?: string;
      };
      await markCatalogFailed(jobId, templateId, error);
    },
  },
  async ({ event, step }) => {
    const { templateId, userId, jobId } = event.data as {
      templateId: string;
      userId: string;
      jobId?: string;
    };

    await step.run("mark-started", () =>
      updateProgress(jobId, templateId, "extracting", 5),
    );

    const extracted = await step.run("extract-pdf-structure", async () => {
      const { bytes } = await downloadTemplate(templateId);
      return extractPdfCatalog(bytes);
    });

    await step.run("mark-ocr", () =>
      updateProgress(jobId, templateId, "ocr", 35),
    );
    const weakPages = [
      ...new Set(
        extracted.fields
          .filter((field) => field.confidence < 0.62)
          .map((field) => field.page),
      ),
    ];

    const ocrTokens: TextToken[] = [];
    for (const page of weakPages) {
      const pageTokens = await step.run(`ocr-page-${page}`, async () => {
        const { bytes } = await downloadTemplate(templateId);
        const rendered = await renderPdfPage(bytes, page, 1.8);
        return recognizePage(
          rendered.buffer,
          page,
          rendered.width,
          rendered.height,
        );
      });
      ocrTokens.push(...pageTokens);
    }

    let fields = assignSpatialGroups(
      assignLabels(extracted.fields, [...extracted.tokens, ...ocrTokens]),
    );
    await step.run("mark-vision", () =>
      updateProgress(jobId, templateId, "vision", 62),
    );
    const { template } = await downloadTemplate(templateId);
    let visionFailed = false;

    if (
      template.allow_vision &&
      process.env.AI_BASE_URL &&
      process.env.AI_API_KEY
    ) {
      const { visionSupportsImages } = createConfiguredProvider();
      const visionPages = [
        ...new Set(
          fields
            .filter((field) => field.confidence < 0.68)
            .map((field) => field.page),
        ),
      ];
      const batches = visionPages.flatMap((page) => {
        const pageFields = fields.filter((field) =>
          field.widgets.some((widget) => widget.page === page),
        );
        return Array.from(
          { length: Math.ceil(pageFields.length / 20) },
          (_, index) => ({
            page,
            index,
            fields: pageFields.slice(index * 20, (index + 1) * 20),
          }),
        );
      });
      const results = await step.run("analyze-field-batches", () =>
        Promise.all(
          batches.map(async (batch) => {
            try {
              let image: Buffer<ArrayBufferLike> = Buffer.alloc(0);
              if (visionSupportsImages) {
                const { bytes } = await downloadTemplate(templateId);
                const overlays = batch.fields.flatMap((field) =>
                  field.widgets
                    .filter((widget) => widget.page === batch.page)
                    .map((widget) => ({ id: field.id, rect: widget.rect })),
                );
                image = (await renderPdfPage(bytes, batch.page, 1.6, overlays))
                  .buffer;
              }
              const catalog = await analyzePageWithVision({
                image,
                page: batch.page,
                fields: batch.fields,
                tokens: [...extracted.tokens, ...ocrTokens],
              });
              return {
                page: batch.page,
                result: { ok: true as const, catalog },
              };
            } catch (error) {
              return {
                page: batch.page,
                result: {
                  ok: false as const,
                  error: (error instanceof Error
                    ? error.message
                    : "Vision analysis failed"
                  ).slice(0, 1_000),
                },
              };
            }
          }),
        ),
      );
      const groupsByPage = new Map<number, Map<string, string>>();
      for (const { page, result } of results) {
        if (!result.ok) {
          visionFailed = true;
          continue;
        }
        const groups = groupsByPage.get(page) ?? new Map<string, string>();
        groupsByPage.set(page, groups);
        const byId = new Map(
          result.catalog.fields.map((field) => [field.fieldId, field]),
        );
        fields = fields.map((field) => {
          const vision = byId.get(field.id);
          if (!vision || vision.confidence < Math.max(0.55, field.confidence))
            return field;
          let groupId: string | null = null;
          if (vision.groupKey) {
            groupId = groups.get(vision.groupKey) ?? randomUUID();
            groups.set(vision.groupKey, groupId);
          }
          return {
            ...field,
            label: vision.label,
            section: vision.section,
            groupId,
            groupOrder: vision.groupOrder,
            confidence: vision.confidence,
            source: "vision" as const,
          };
        });
      }
    }

    await step.run("persist-catalog", async () => {
      await updateProgress(jobId, templateId, "saving", 88);
      const admin = createAdminClient();
      await admin.from("pdf_fields").delete().eq("template_id", templateId);
      const { error: fieldError } = await admin.from("pdf_fields").insert(
        fields.map((field) => ({
          id: field.id,
          template_id: templateId,
          pdf_name: field.pdfName,
          kind: field.kind,
          default_value: field.defaultValue,
          options: field.options,
          auto_label: field.label,
          auto_aliases: field.aliases,
          auto_section: field.section,
          page: field.page,
          auto_group_id: field.groupId,
          auto_group_order: field.groupOrder,
          confidence: field.confidence,
          source: field.source,
        })),
      );
      if (fieldError) throw fieldError;
      const widgets = fields.flatMap((field) =>
        field.widgets.map((widget) => ({
          field_id: field.id,
          page: widget.page,
          rect: widget.rect,
          pdf_rect: widget.pdfRect,
          rotation: widget.rotation,
          export_value: widget.exportValue,
          widget_index: widget.widgetIndex,
        })),
      );
      if (widgets.length) {
        const { error: widgetError } = await admin
          .from("pdf_field_widgets")
          .insert(widgets);
        if (widgetError) throw widgetError;
      }

      const { data: characters } = await admin
        .from("characters")
        .select("id")
        .eq("template_id", templateId);
      const values = (characters ?? []).flatMap((character) =>
        fields.map((field) => ({
          character_id: character.id,
          field_id: field.id,
          value: field.defaultValue,
          version: 0,
          updated_by: userId,
        })),
      );
      if (values.length)
        await admin
          .from("character_values")
          .upsert(values, { onConflict: "character_id,field_id" });
    });

    const finalStatus = visionFailed ? "partial" : "ready";
    await step.run("mark-complete", async () => {
      const admin = createAdminClient();
      await admin
        .from("pdf_templates")
        .update({
          catalog_status: finalStatus,
          catalog_error: visionFailed ? "Vision analysis was incomplete" : null,
        })
        .eq("id", templateId);
      if (jobId)
        await admin
          .from("catalog_jobs")
          .update({
            status: finalStatus,
            current_step: "complete",
            progress: 100,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId);
    });
    return { fields: fields.length, status: finalStatus };
  },
);

export const purgeTrashedCharacters = inngest.createFunction(
  {
    id: "purge-trashed-characters",
    retries: 2,
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) =>
    step.run("purge", async () => {
      const admin = createAdminClient();
      const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data: characters } = await admin
        .from("characters")
        .select("id")
        .eq("status", "trashed")
        .lt("deleted_at", cutoff);
      if (characters?.length)
        await admin
          .from("characters")
          .delete()
          .in(
            "id",
            characters.map((character) => character.id),
          );
      return { purged: characters?.length ?? 0 };
    }),
);
