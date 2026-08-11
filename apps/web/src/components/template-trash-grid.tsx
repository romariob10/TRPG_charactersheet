"use client";

import { useState } from "react";
import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export interface TrashedTemplateCard {
  id: string;
  title: string;
  gameSystem: string | null;
  pageCount: number;
  deletedAt: string;
  purgeUntil: string;
}

export function TemplateTrashGrid({
  templates,
}: {
  templates: TrashedTemplateCard[];
}) {
  const t = useTranslations("Systems");
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    templateId: string;
    activeTemplateId: string;
  } | null>(null);

  async function restore(templateId: string) {
    setPendingId(templateId);
    setError(null);
    setConflict(null);
    try {
      const response = await fetch(`/api/templates/${templateId}/restore`, {
        method: "POST",
      });
      const result = (await response.json().catch(() => undefined)) as
        | {
            error?: {
              code?: string;
              message?: string;
              details?: { activeTemplateId?: string };
            };
          }
        | undefined;
      if (!response.ok) {
        if (
          response.status === 409 &&
          result?.error?.code === "TEMPLATE_DUPLICATE_ACTIVE"
        ) {
          setConflict({
            templateId,
            activeTemplateId: result.error.details?.activeTemplateId ?? "",
          });
          return;
        }
        throw new Error(result?.error?.message ?? t("trashRestoreFailed"));
      }
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("trashRestoreFailed"),
      );
    } finally {
      setPendingId(null);
    }
  }

  if (!templates.length) {
    return (
      <div className="mt-8 rounded-[var(--radius-card)] border border-dashed bg-[var(--keylime)] px-6 py-10 text-center">
        <Trash2 className="mx-auto size-8 text-[var(--brand)]" />
        <h2 className="mt-5 text-xl font-bold">{t("trashEmpty")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-[var(--muted)]">
          {t("trashEmptyText")}
        </p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {conflict && (
        <div
          role="alert"
          className="mt-6 rounded-[var(--radius-control)] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p>{t("trashRestoreConflict")}</p>
          {conflict.activeTemplateId && (
            <Link
              href={`/dashboard/systems/${conflict.activeTemplateId}`}
              className="mt-2 inline-flex items-center gap-1 font-semibold text-[var(--brand)] underline"
            >
              {t("trashOpenActive")}
            </Link>
          )}
        </div>
      )}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <article
            key={template.id}
            className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="grid size-11 place-items-center rounded-[var(--radius-control)] bg-[var(--keylime)] text-[var(--muted)]">
                <Trash2 className="size-6" />
              </div>
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                {t("trashPurgeCountdown", { date: template.purgeUntil })}
              </span>
            </div>
            <p className="mt-5 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              {template.gameSystem ?? t("unknownSystem")}
            </p>
            <h2 className="mt-1 truncate text-xl font-bold">{template.title}</h2>
            <p className="mt-3 text-xs text-[var(--muted)]">
              {t("pages", { count: template.pageCount })} ·{" "}
              {t("trashDeletedAgo", { date: template.deletedAt })}
            </p>
            <div className="mt-6 border-t pt-4">
              <Button
                className="w-full"
                variant="secondary"
                disabled={pendingId === template.id}
                onClick={() => void restore(template.id)}
              >
                <RotateCcw className="size-4" />
                {pendingId === template.id
                  ? t("trashRestoring")
                  : t("trashRestore")}
              </Button>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
