import { getLocale, getTranslations } from "next-intl/server";
import { SystemsSectionTabs } from "@/components/systems-section-tabs";
import {
  TemplateTrashGrid,
  type TrashedTemplateCard,
} from "@/components/template-trash-grid";
import { apiFetch } from "@/lib/api/server";
import type { TemplateSummary } from "@/lib/types";

const TRASH_RETENTION_DAYS = 30;

export default async function SystemsTrashPage() {
  const [t, locale] = await Promise.all([
    getTranslations("Systems"),
    getLocale(),
  ]);
  const { data } = await apiFetch<{ items: TemplateSummary[] }>(
    "/api/templates?scope=trash",
  );
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const templates: TrashedTemplateCard[] = data.items
    .filter((template) => template.deletedAt)
    .map((template) => {
      const deletedAt = new Date(template.deletedAt as string);
      const purgeUntil = new Date(
        deletedAt.getTime() + TRASH_RETENTION_DAYS * 86_400_000,
      );
      return {
        id: template.id,
        title: template.title,
        gameSystem: template.gameSystem,
        pageCount: template.pageCount,
        deletedAt: dateFormatter.format(deletedAt),
        purgeUntil: dateFormatter.format(purgeUntil),
      };
    });

  return (
    <main className="page-shell py-8">
      <h1 className="display-heading text-4xl text-[var(--brand)] sm:text-[2.75rem]">
        {t("trashTitle")}
      </h1>
      <p className="mt-2 max-w-2xl text-[var(--muted)]">
        {t("trashSubtitle", { days: TRASH_RETENTION_DAYS })}
      </p>
      <SystemsSectionTabs active="trash" />
      <TemplateTrashGrid templates={templates} />
    </main>
  );
}
