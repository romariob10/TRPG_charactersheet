import Link from "next/link";
import { Database, Plus, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { CharacterCard } from "@/components/character-card";
import { buttonClassName } from "@/components/ui/button";
import { requireUser } from "@/lib/supabase/auth";
import type { CharacterSummary } from "@/lib/types";

interface CharacterRow {
  id: string;
  name: string;
  owner_id: string;
  revision: number;
  status: "active" | "trashed";
  deleted_at: string | null;
  updated_at: string;
  pdf_templates:
    | {
        page_count: number;
        catalog_status: CharacterSummary["catalogStatus"];
      }
    | {
        page_count: number;
        catalog_status: CharacterSummary["catalogStatus"];
      }[]
    | null;
}

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const [t, locale] = await Promise.all([
    getTranslations("Dashboard"),
    getLocale(),
  ]);
  const { data, error } = await supabase
    .from("characters")
    .select(
      "id,name,owner_id,revision,status,deleted_at,updated_at,pdf_templates(page_count,catalog_status)",
    )
    .order("updated_at", { ascending: false });
  if (
    error?.code === "PGRST205" ||
    error?.message.includes("public.characters")
  ) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-6 sm:p-8">
          <div className="grid size-12 place-items-center rounded-[var(--radius-control)] bg-amber-100 text-amber-800">
            <Database className="size-7" />
          </div>
          <h1 className="display-heading mt-6 text-4xl text-amber-950">
            {t("databaseMissingTitle")}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-amber-950/75">
            {t("databaseMissingText")}
          </p>
          <p className="mt-6 text-sm font-semibold text-amber-950">
            {t("databaseMissingCommand")}:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-[var(--radius-control)] bg-slate-950 p-4 text-sm text-slate-100">
            <code>docker compose --profile tools run --rm migrate</code>
          </pre>
        </div>
      </main>
    );
  }
  if (error) throw new Error(error.message);

  const characters: CharacterSummary[] = (
    (data ?? []) as unknown as CharacterRow[]
  ).map((row) => {
    const template = Array.isArray(row.pdf_templates)
      ? row.pdf_templates[0]
      : row.pdf_templates;
    return {
      id: row.id,
      name: row.name,
      role: row.owner_id === user.id ? "owner" : "editor",
      revision: row.revision,
      status: row.status,
      catalogStatus: template?.catalog_status ?? "pending",
      pageCount: template?.page_count ?? 0,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  });
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
          <div className="mt-4 max-w-2xl rounded-[var(--radius-card)] border border-dashed bg-[var(--keylime)] px-6 py-10 text-center">
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
