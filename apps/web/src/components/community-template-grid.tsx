"use client";

import { useState } from "react";
import { Check, FileText, RefreshCw, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

export interface CommunityTemplateCard {
  id: string;
  title: string;
  gameSystem: string | null;
  pageCount: number;
  updatedAt: string;
  subscribed: boolean;
}

export function CommunityTemplateGrid({
  templates,
}: {
  templates: CommunityTemplateCard[];
}) {
  const t = useTranslations("Systems");
  const router = useRouter();
  const [subscriptions, setSubscriptions] = useState(
    () =>
      new Set(
        templates.filter((item) => item.subscribed).map((item) => item.id),
      ),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(templateId: string) {
    const subscribed = subscriptions.has(templateId);
    setPendingId(templateId);
    setError(null);
    try {
      await apiFetch(
        `/api/templates/${templateId}/subscription`,
        { method: subscribed ? "DELETE" : "POST" },
      );
      setSubscriptions((current) => {
        const next = new Set(current);
        if (subscribed) next.delete(templateId);
        else next.add(templateId);
        return next;
      });
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("subscribeFailed"));
    } finally {
      setPendingId(null);
    }
  }

  if (!templates.length) {
    return (
      <div className="mt-8 rounded-[var(--radius-card)] border border-dashed bg-[var(--keylime)] px-6 py-10 text-center">
        <Users className="mx-auto size-8 text-[var(--brand)]" />
        <h2 className="mt-5 text-xl font-bold">{t("communityEmpty")}</h2>
        <p className="mx-auto mt-2 max-w-lg text-[var(--muted)]">
          {t("communityEmptyText")}
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
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => {
          const subscribed = subscriptions.has(template.id);
          return (
            <article
              id={`template-${template.id}`}
              key={template.id}
              className="scroll-mt-24 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors target:ring-2 target:ring-[var(--brand)] hover:border-[var(--brand)]/35"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="grid size-11 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]">
                  <FileText className="size-6" />
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  {t("communityReady")}
                </span>
              </div>
              <p className="mt-5 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                {template.gameSystem ?? t("unknownSystem")}
              </p>
              <h2 className="mt-1 truncate text-xl font-bold">
                {template.title}
              </h2>
              <div className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]">
                <RefreshCw className="size-3.5" />
                {t("syncedAutomatically")}
              </div>
              <div className="mt-6 border-t pt-4">
                <Button
                  className="w-full"
                  variant={subscribed ? "secondary" : "primary"}
                  disabled={pendingId === template.id}
                  onClick={() => void toggle(template.id)}
                >
                  {subscribed ? (
                    <Check className="size-4" />
                  ) : (
                    <Users className="size-4" />
                  )}
                  {pendingId === template.id
                    ? t("subscriptionPending")
                    : subscribed
                      ? t("removeFromMine")
                      : t("addToMine")}
                </Button>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
