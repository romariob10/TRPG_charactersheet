import { CommunityTemplateGrid } from "@/components/community-template-grid";
import { SystemsSectionTabs } from "@/components/systems-section-tabs";
import { apiFetch } from "@/lib/api/server";
import type { TemplateSummary } from "@/lib/types";
import { getTranslations } from "next-intl/server";

export default async function CommunitySystemsPage() {
  const t = await getTranslations("Systems");
  const { data } = await apiFetch<{ items: TemplateSummary[] }>(
    "/api/templates?scope=community",
  );
  const templates = data.items.map((template) => ({
    id: template.id,
    title: template.title,
    gameSystem: template.gameSystem,
    pageCount: template.pageCount,
    updatedAt: template.updatedAt,
    subscribed: Boolean(template.subscribed),
  }));

  return (
    <main className="page-shell py-8">
      <h1 className="display-heading text-4xl text-[var(--brand)] sm:text-[2.75rem]">
        {t("exploreCommunity")}
      </h1>
      <p className="mt-2 max-w-2xl text-[var(--muted)]">
        {t("communitySubtitle")}
      </p>
      <SystemsSectionTabs active="community" />
      <CommunityTemplateGrid templates={templates} />
    </main>
  );
}
