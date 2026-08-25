import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  FileSearch,
  FileText,
  FolderOpen,
  Globe2,
  Lock,
  Plus,
  RefreshCw,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { SystemsSectionTabs } from "@/components/systems-section-tabs";
import { buttonClassName } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/server";
import type { GameSystemSummary } from "@mycharacter/contracts";
import type { TemplateSummary } from "@/lib/types";
import { cn, formatRelativeDate } from "@/lib/utils";

export default async function SystemsPage() {
  const [t, locale] = await Promise.all([
    getTranslations("Systems"),
    getLocale(),
  ]);

  const [systemsRes, templatesRes] = await Promise.all([
    apiFetch<GameSystemSummary[]>("/api/game-systems").catch(() => ({ data: [] as GameSystemSummary[] })),
    apiFetch<{ items: TemplateSummary[] }>("/api/templates?scope=mine").catch(() => ({ data: { items: [] as TemplateSummary[] } })),
  ]);

  const systems = systemsRes.data ?? [];
  const templates = templatesRes.data?.items ?? [];

  const hasItems = systems.length > 0 || templates.length > 0;

  return (
    <main className="page-shell py-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="display-heading text-4xl text-[var(--brand)] sm:text-[2.75rem]">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">{t("subtitle")}</p>
        </div>
        <Link
          href="/dashboard/systems/new"
          className={buttonClassName({ size: "md" })}
        >
          <Plus className="size-4" />
          {t("new")}
        </Link>
      </div>
      <SystemsSectionTabs active="mine" />

      {hasItems ? (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Game Systems (Canonical) */}
          {systems.map((system) => {
            return (
              <article
                key={system.id}
                className="group relative rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--brand)]/35"
              >
                <Link
                  href={`/dashboard/systems/${system.id}/workspace`}
                  className="absolute inset-0 rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
                  aria-label={t("openWorkspace", { name: system.title })}
                />
                <div className="pointer-events-none relative flex items-start justify-between gap-4">
                  <div className="grid size-11 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]">
                    <BookOpen className="size-6" />
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      system.visibility === "public"
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-sky-50 text-sky-800",
                    )}
                  >
                    {system.visibility === "public" ? t("published") : t("private")}
                  </span>
                </div>
                <p className="pointer-events-none relative mt-5 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                  {system.family || system.edition || t("customSystem")}
                </p>
                <h2 className="pointer-events-none relative mt-1 truncate text-xl font-bold">
                  {system.title}
                </h2>
                <div className="pointer-events-none relative mt-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
                  {system.visibility === "public" ? (
                    <Globe2 className="size-3.5" />
                  ) : (
                    <Lock className="size-3.5" />
                  )}
                  {system.visibility === "public" ? t("published") : t("private")}
                </div>
                <div className="pointer-events-none relative mt-6 flex items-center justify-between gap-2 border-t pt-4 text-xs text-[var(--muted)]">
                  <span>{system.description ? system.description.slice(0, 30) : t("activeSystem")}</span>
                  <Link
                    href={`/dashboard/systems/${system.id}/workspace`}
                    aria-label={t("openWorkspace", { name: system.title })}
                    className="pointer-events-auto relative z-10 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1 font-semibold text-[var(--brand)] transition-colors hover:border-[var(--brand)]/40"
                  >
                    <FolderOpen className="size-3.5" />
                    {t("workspace")}
                  </Link>
                  <span>{formatRelativeDate(system.updatedAt, locale)}</span>
                </div>
              </article>
            );
          })}

          {/* Legacy PDF Templates if not already represented */}
          {templates
            .filter((tpl) => !systems.some((s) => s.id === tpl.id || s.legacyTemplateId === tpl.id))
            .map((template) => {
              const processing = ["pending", "processing"].includes(template.catalogStatus);
              const approved = Boolean(template.approvedAt);
              return (
                <article
                  key={template.id}
                  className="group relative rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--brand)]/35"
                >
                  <Link
                    href={
                      template.subscribed
                        ? `/dashboard/systems/community#template-${template.id}`
                        : `/dashboard/systems/${template.id}/workspace`
                    }
                    className="absolute inset-0 rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
                    aria-label={
                      template.subscribed
                        ? t("openCommunityTemplate", { name: template.title })
                        : t("openTemplate", { name: template.title })
                    }
                  />
                  <div className="pointer-events-none relative flex items-start justify-between gap-4">
                    <div className="grid size-11 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]">
                      {template.subscribed ? (
                        <RefreshCw className="size-6" />
                      ) : approved ? (
                        <CheckCircle2 className="size-6" />
                      ) : processing ? (
                        <FileSearch className="size-6" />
                      ) : (
                        <FileText className="size-6" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        approved
                          ? "bg-emerald-50 text-emerald-800"
                          : processing
                            ? "bg-amber-50 text-amber-800"
                            : template.catalogStatus === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-sky-50 text-sky-800",
                      )}
                    >
                      {template.subscribed
                        ? t("synced")
                        : approved
                          ? t("approved")
                          : processing
                            ? t("processing")
                            : template.catalogStatus === "failed"
                              ? t("failed")
                              : t("review")}
                    </span>
                  </div>
                  <p className="pointer-events-none relative mt-5 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                    {template.gameSystem ?? t("unknownSystem")}
                  </p>
                  <h2 className="pointer-events-none relative mt-1 truncate text-xl font-bold">
                    {template.title}
                  </h2>
                  {!template.subscribed && (
                    <div className="pointer-events-none relative mt-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
                      {template.isPublic ? (
                        <Globe2 className="size-3.5" />
                      ) : (
                        <Lock className="size-3.5" />
                      )}
                      {template.isPublic
                        ? approved
                          ? t("publishedNow")
                          : t("published")
                        : t("private")}
                    </div>
                  )}
                  <div className="pointer-events-none relative mt-6 flex items-center justify-between gap-2 border-t pt-4 text-xs text-[var(--muted)]">
                    <span>{t("pages", { count: template.pageCount })}</span>
                    {!template.subscribed && (
                      <Link
                        href={`/dashboard/systems/${template.id}/workspace`}
                        aria-label={t("openWorkspace", { name: template.title })}
                        className="pointer-events-auto relative z-10 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1 font-semibold text-[var(--brand)] transition-colors hover:border-[var(--brand)]/40"
                      >
                        <FolderOpen className="size-3.5" />
                        {t("workspace")}
                      </Link>
                    )}
                    <span>{formatRelativeDate(template.updatedAt, locale)}</span>
                  </div>
                </article>
              );
            })}
        </section>
      ) : (
        <div className="mt-8 rounded-[var(--radius-card)] border border-dashed bg-[var(--keylime)] px-6 py-10 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]">
            <BookOpen className="size-6" />
          </div>
          <h2 className="mt-5 text-xl font-bold">{t("empty")}</h2>
          <p className="mx-auto mt-2 max-w-lg text-[var(--muted)]">
            {t("emptyText")}
          </p>
        </div>
      )}
    </main>
  );
}
