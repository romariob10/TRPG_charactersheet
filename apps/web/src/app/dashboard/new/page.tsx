import { getTranslations } from "next-intl/server";
import { CreateCharacterForm } from "@/components/create-character-form";
import { apiFetch } from "@/lib/api/server";
import type { TemplateSummary } from "@/lib/types";

export default async function NewCharacterPage() {
  const t = await getTranslations("Create");
  const { data } = await apiFetch<{ items: TemplateSummary[] }>(
    "/api/templates?scope=creation",
  );
  const templates = data.items.map((template) => ({
      id: template.id,
      title: template.title,
      gameSystem: template.gameSystem,
      pageCount: template.pageCount,
      community: Boolean(template.subscribed),
    }));
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
