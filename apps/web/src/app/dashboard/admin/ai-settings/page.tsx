import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AiSettingsResponse } from "@mycharacter/contracts";
import { AdminAiSettingsForm } from "@/components/admin-ai-settings-form";
import { apiFetch } from "@/lib/api/server";

export default async function AdminAiSettingsPage() {
  const [settings, t] = await Promise.all([
    apiFetch<AiSettingsResponse>("/api/admin/ai-settings"),
    getTranslations("AdminAi"),
  ]);

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-white">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t("sectionTitle")}</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
            {t("sectionText")}
          </p>
        </div>
      </div>
      <AdminAiSettingsForm initial={settings.data} />
    </section>
  );
}
