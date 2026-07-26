import { CommunityTemplateGrid } from "@/components/community-template-grid";
import { SystemsSectionTabs } from "@/components/systems-section-tabs";
import { requireUser } from "@/lib/supabase/auth";
import { getTranslations } from "next-intl/server";

export default async function CommunitySystemsPage() {
  const { supabase, user } = await requireUser();
  const t = await getTranslations("Systems");
  const [templatesResult, subscriptionsResult] = await Promise.all([
    supabase
      .from("pdf_templates")
      .select("id,title,game_system,page_count,updated_at")
      .eq("visibility", "private")
      .eq("is_public", true)
      .is("deleted_at", null)
      .neq("owner_id", user.id)
      .in("catalog_status", ["ready", "partial"])
      .not("catalog_approved_at", "is", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("template_subscriptions")
      .select("template_id")
      .eq("user_id", user.id),
  ]);
  if (templatesResult.error) throw new Error(templatesResult.error.message);
  if (subscriptionsResult.error)
    throw new Error(subscriptionsResult.error.message);

  const subscribedIds = new Set(
    (subscriptionsResult.data ?? []).map((item) => item.template_id),
  );
  const templates = (templatesResult.data ?? []).map((template) => ({
    id: template.id,
    title: template.title,
    gameSystem: template.game_system,
    pageCount: template.page_count,
    updatedAt: template.updated_at,
    subscribed: subscribedIds.has(template.id),
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
