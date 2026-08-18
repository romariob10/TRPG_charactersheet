import Link from "next/link";
import { Compass, Plus, Sparkles, UsersRound } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { SocialFeed } from "@/components/social-feed";
import { buttonClassName } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/server";
import type { MyProfile, SocialFeedItem } from "@/lib/types";

export default async function FeedPage() {
  const [feed, profile, t, locale] = await Promise.all([
    apiFetch<{ items: SocialFeedItem[] }>("/api/feed"),
    apiFetch<MyProfile>("/api/profiles/me"),
    getTranslations("Feed"),
    getLocale(),
  ]);
  const people = Array.from(
    new Map(feed.data.items.map((item) => [item.author.username, item.author])).values(),
  )
    .filter((author) => author.id !== profile.data.id)
    .slice(0, 4);

  return (
    <main className="page-shell py-5 sm:py-8">
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,720px)_minmax(260px,1fr)] xl:gap-10">
        <section className="min-w-0">
          <div className="mb-5 flex items-end justify-between gap-4 px-0 sm:mb-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold tracking-[.13em] text-[var(--brand)] uppercase">
                <Compass className="size-4" /> {t("eyebrow")}
              </div>
              <h1 className="display-heading mt-1 text-4xl text-[var(--brand)] sm:text-[2.75rem]">{t("title")}</h1>
              <p className="mt-1 max-w-xl text-sm text-[var(--muted)] sm:text-base">{t("subtitle")}</p>
            </div>
          </div>
          <SocialFeed items={feed.data.items} locale={locale} />
        </section>

        <aside className="hidden space-y-4 lg:sticky lg:top-5 lg:block">
          <section className="overflow-hidden rounded-[1.15rem] bg-[var(--brand)] p-5 text-white">
            <Sparkles className="size-5 text-[var(--sage)]" />
            <h2 className="display-heading mt-3 text-2xl">{t("createTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-white/70">{t("createText")}</p>
            <div className="mt-5 grid gap-2">
              <Link href="/dashboard/new" className={buttonClassName({ variant: "secondary", size: "sm" }) + " w-full border-white/20 bg-white text-[var(--brand)]"}>
                <Plus className="size-4" /> {t("newCharacter")}
              </Link>
              <Link href="/dashboard/systems/new" className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-white/20 px-3 text-sm font-semibold text-white hover:bg-white/10">
                <Plus className="size-4" /> {t("newSystem")}
              </Link>
            </div>
          </section>

          {people.length > 0 && (
            <section className="rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center gap-2">
                <UsersRound className="size-4 text-[var(--brand)]" />
                <h2 className="font-bold">{t("people")}</h2>
              </div>
              <div className="mt-4 space-y-3">
                {people.map((author) => (
                  <Link key={author.id} href={`/users/${author.username}`} className="flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-[var(--keylime)]">
                    <span className="grid size-9 place-items-center rounded-full bg-[var(--brand-soft)] text-xs font-black text-[var(--brand)]">
                      {(author.displayName ?? author.username).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{author.displayName ?? author.username}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">@{author.username}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
