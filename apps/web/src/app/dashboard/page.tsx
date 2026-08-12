import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { CharacterCard } from "@/components/character-card";
import { buttonClassName } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/server";
import type { CharacterSummary } from "@/lib/types";

export default async function DashboardPage() {
  const [t, locale] = await Promise.all([
    getTranslations("Dashboard"),
    getLocale(),
  ]);
  const { data } = await apiFetch<{ items: CharacterSummary[] }>(
    "/api/characters",
  );
  const characters = data.items;
  const active = characters.filter((item) => item.status === "active");
  const trash = characters.filter(
    (item) => item.status === "trashed" && item.role === "owner",
  );

  return (
    <main className="page-shell py-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="display-heading text-4xl text-[var(--brand)] sm:text-[2.75rem]">{t("title")}</h1>
          <p className="mt-2 text-[var(--muted)]">{t("subtitle")}</p>
        </div>
        <Link href="/dashboard/new" className={buttonClassName({ size: "md" })}>
          <Plus className="size-4" />
          {t("new")}
        </Link>
      </div>
      <section className="mt-8">
        <h2 className="text-sm font-bold tracking-[.14em] text-[var(--muted)] uppercase">
          {t("active")}
        </h2>
        {active.length ? (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                locale={locale}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 w-full rounded-[var(--radius-card)] border border-dashed bg-[var(--keylime)] px-6 py-10 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]">
              <Sparkles className="size-6" />
            </div>
            <h2 className="mt-5 text-xl font-bold">{t("empty")}</h2>
            <p className="mx-auto mt-2 max-w-md text-[var(--muted)]">
              {t("emptyText")}
            </p>
          </div>
        )}
      </section>
      {trash.length > 0 && (
        <section className="mt-12">
          <h2 className="text-sm font-bold tracking-[.14em] text-[var(--muted)] uppercase">
            {t("trash")}
          </h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {trash.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                locale={locale}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
