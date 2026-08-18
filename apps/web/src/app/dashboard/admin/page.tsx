import { ShieldCheck, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { AiSettingsResponse } from "@mycharacter/contracts";
import { AdminAiSettingsForm } from "@/components/admin-ai-settings-form";
import { apiFetch } from "@/lib/api/server";
import type { MyProfile } from "@/lib/types";

export default async function AdminPage() {
  const [profile, settings, t] = await Promise.all([
    apiFetch<MyProfile>("/api/profiles/me"),
    apiFetch<AiSettingsResponse>("/api/admin/ai-settings"),
    getTranslations("AdminAi"),
  ]);
  if (!profile.data.isAdmin) notFound();

  return (
    <main className="page-shell py-6 sm:py-9">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-bold tracking-[.13em] text-[var(--brand)] uppercase">
          <ShieldCheck className="size-4" /> {t("eyebrow")}
        </div>
        <h1 className="display-heading mt-1 text-4xl text-[var(--brand)] sm:text-[2.75rem]">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
          {t("subtitle")}
        </p>

        <section className="mt-7 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
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
      </div>
    </main>
  );
}
