import { getTranslations } from "next-intl/server";
import { CreateCharacterForm } from "@/components/create-character-form";
import { requireUser } from "@/lib/supabase/auth";

export default async function NewCharacterPage() {
  const t = await getTranslations("Create");
  const { supabase, user } = await requireUser();
  const [baseResult, subscriptionsResult] = await Promise.all([
    supabase
      .from("pdf_templates")
      .select("id,title,game_system,page_count")
      .or(`visibility.eq.curated,owner_id.eq.${user.id}`)
      .is("deleted_at", null)
      .in("catalog_status", ["ready", "partial"])
      .not("catalog_approved_at", "is", null)
      .order("game_system")
      .order("title"),
    supabase
      .from("template_subscriptions")
      .select("template_id")
      .eq("user_id", user.id),
  ]);
  if (baseResult.error) throw new Error(baseResult.error.message);
  if (subscriptionsResult.error)
    throw new Error(subscriptionsResult.error.message);
  const subscribedIds = (subscriptionsResult.data ?? []).map(
    (item) => item.template_id,
  );
  const communityResult = subscribedIds.length
    ? await supabase
        .from("pdf_templates")
        .select("id,title,game_system,page_count")
        .in("id", subscribedIds)
        .eq("is_public", true)
        .is("deleted_at", null)
        .in("catalog_status", ["ready", "partial"])
        .not("catalog_approved_at", "is", null)
        .order("game_system")
        .order("title")
    : { data: [], error: null };
  if (communityResult.error) throw new Error(communityResult.error.message);
  const templates = [
    ...(baseResult.data ?? []).map((template) => ({
      id: template.id,
      title: template.title,
      gameSystem: template.game_system,
      pageCount: template.page_count,
      community: false,
    })),
    ...(communityResult.data ?? []).map((template) => ({
      id: template.id,
      title: template.title,
      gameSystem: template.game_system,
      pageCount: template.page_count,
      community: true,
    })),
  ];
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <h1 className="display-heading text-4xl text-[var(--brand)]">{t("title")}</h1>
      <p className="mt-2 text-[var(--muted)]">{t("intro")}</p>
      <div className="mt-7 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--keylime)] p-5 sm:p-7">
        <CreateCharacterForm templates={templates} />
      </div>
    </main>
  );
}
