import Link from "next/link";
import { BadgeCheck, BookOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { GameSystemSummary } from "@mycharacter/contracts";
import { SystemsSectionTabs } from "@/components/systems-section-tabs";
import { apiFetch } from "@/lib/api/server";

export default async function OfficialSystemsPage() {
  const [t, response] = await Promise.all([
    getTranslations("Systems"),
    apiFetch<GameSystemSummary[]>("/api/game-systems?scope=official").catch(
      () => ({ data: [] as GameSystemSummary[] }),
    ),
  ]);
  const systems = response.data ?? [];

  return (
    <main className="page-shell py-8">
      <h1 className="display-heading text-4xl text-[var(--brand)] sm:text-[2.75rem]">
        {t("officialTitle")}
      </h1>
      <p className="mt-2 max-w-2xl text-[var(--muted)]">
        {t("officialSubtitle")}
      </p>
      <SystemsSectionTabs active="official" />

      {systems.length > 0 ? (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {systems.map((system) => (
            <article
              key={system.id}
              className="relative rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--brand)]/35"
            >
              <Link
                href={`/dashboard/systems/${system.id}/workspace`}
                className="absolute inset-0 rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
                aria-label={t("openWorkspace", { name: system.title })}
              />
              <div className="pointer-events-none relative flex items-start justify-between gap-4">
                <span className="grid size-11 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]">
                  <BookOpen className="size-6" />
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <BadgeCheck className="size-3.5" />
                  {t("officialBadge")}
                </span>
              </div>
              <p className="pointer-events-none relative mt-5 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                {system.family || system.edition || t("customSystem")}
              </p>
              <h2 className="pointer-events-none relative mt-1 text-xl font-bold">
                {system.title}
              </h2>
              <p className="pointer-events-none relative mt-3 line-clamp-3 text-sm text-[var(--muted)]">
                {system.description || t("activeSystem")}
              </p>
            </article>
          ))}
        </section>
      ) : (
        <div className="mt-8 rounded-[var(--radius-card)] border border-dashed bg-[var(--keylime)] px-6 py-10 text-center">
          <BadgeCheck className="mx-auto size-10 text-[var(--brand)]" />
          <h2 className="mt-4 text-xl font-bold">{t("officialEmpty")}</h2>
          <p className="mt-2 text-[var(--muted)]">{t("officialEmptyText")}</p>
        </div>
      )}
    </main>
  );
}
