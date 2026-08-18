"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  FileUser,
  MessageCircle,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { LikeButton } from "@/components/social-like-button";
import { RemixButton } from "@/components/remix-button";
import type { SocialFeedItem } from "@/lib/types";
import { cn, formatRelativeDate } from "@/lib/utils";

type FeedFilter = "all" | "system" | "character";

export function SocialFeed({
  items,
  locale,
}: {
  items: SocialFeedItem[];
  locale: string;
}) {
  const t = useTranslations("Feed");
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale);
    return items.filter((item) => {
      if (filter !== "all" && item.kind !== filter) return false;
      if (!normalized) return true;
      return [item.title, item.gameSystem, item.author.username, item.author.displayName]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase(locale).includes(normalized));
    });
  }, [filter, items, locale, query]);

  return (
    <div>
      <div className="sticky top-0 z-30 -mx-4 border-b border-[var(--border)] bg-[color:color-mix(in_srgb,var(--background)_92%,transparent)] px-4 py-3 backdrop-blur-xl sm:static sm:mx-0 sm:rounded-[var(--radius-card)] sm:border sm:bg-[var(--surface)] sm:p-2 sm:backdrop-blur-none">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
            {(["all", "system", "character"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors",
                  filter === value
                    ? "bg-[var(--brand)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--brand)]",
                )}
              >
                {t(`filter.${value}`)}
              </button>
            ))}
          </div>
          <label className="group relative hidden w-52 shrink-0 md:block">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted)]" />
            <span className="sr-only">{t("search")}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              className="h-9 w-full rounded-full border border-[var(--border)] bg-[var(--background)] pr-3 pl-9 text-sm outline-none focus:border-[var(--brand)]"
            />
          </label>
          <button
            type="button"
            onClick={() => setMobileSearchOpen((open) => !open)}
            className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--keylime)] md:hidden"
            aria-label={t("search")}
            aria-expanded={mobileSearchOpen}
          >
            <SlidersHorizontal className="size-4" />
          </button>
        </div>
        {mobileSearchOpen && (
          <label className="relative mt-2 block md:hidden">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted)]" />
            <span className="sr-only">{t("search")}</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              className="h-10 w-full rounded-full border border-[var(--border)] bg-[var(--background)] pr-3 pl-9 text-sm outline-none focus:border-[var(--brand)]"
            />
          </label>
        )}
      </div>

      {visible.length ? (
        <div className="mt-4 space-y-4 sm:mt-5">
          {visible.map((item) => (
            <FeedCard key={`${item.kind}-${item.id}`} item={item} locale={locale} />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center">
          <Search className="mx-auto size-7 text-[var(--muted)]" />
          <h2 className="mt-4 text-lg font-bold">{t("empty")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("emptyText")}</p>
        </div>
      )}
    </div>
  );
}

function FeedCard({ item, locale }: { item: SocialFeedItem; locale: string }) {
  const t = useTranslations("Feed");
  const href = item.kind === "system"
    ? `/community/${item.author.username}/${item.slug}`
    : `/users/${item.author.username}/sheets/${item.slug}`;
  const initials = (item.author.displayName ?? item.author.username)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="overflow-hidden rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(15,62,23,0.04)]">
      <header className="flex items-center gap-3 px-4 py-4 sm:px-5">
        <Link href={`/users/${item.author.username}`} className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-xs font-bold text-white ring-4 ring-[var(--keylime)]">
          {initials}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/users/${item.author.username}`} className="block truncate font-bold hover:text-[var(--brand)]">
            {item.author.displayName ?? `@${item.author.username}`}
          </Link>
          <p className="truncate text-xs text-[var(--muted)]">
            @{item.author.username} · {formatRelativeDate(item.publishedAt, locale)}
          </p>
        </div>
        <span className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
          item.kind === "system"
            ? "bg-[#e7e0ff] text-[#50358f]"
            : "bg-[var(--brand-soft)] text-[var(--brand)]",
        )}>
          {item.kind === "system" ? <BookOpen className="size-3.5" /> : <FileUser className="size-3.5" />}
          <span className="hidden sm:inline">{t(`kind.${item.kind}`)}</span>
        </span>
      </header>

      <Link href={href} className="group block px-4 pb-4 sm:px-5">
        <p className="text-xs font-bold tracking-[.12em] text-[var(--muted)] uppercase">
          {item.gameSystem ?? t("unknownSystem")}
        </p>
        <h2 className="display-heading mt-1 text-[1.8rem] text-[var(--brand)] transition-colors group-hover:text-[var(--brand-strong)] sm:text-[2rem]">
          {item.title}
        </h2>
        <div className={cn(
          "mt-4 min-h-44 overflow-hidden rounded-[.95rem] border p-4 sm:min-h-52 sm:p-5",
          item.kind === "system"
            ? "border-[#d9d0f4] bg-[#f3f0ff]"
            : "border-[#cde4d1] bg-[var(--keylime)]",
        )}>
          {item.kind === "system" ? (
            <SystemPreview title={item.title} pages={item.pageCount} />
          ) : (
            <CharacterPreview title={item.title} />
          )}
        </div>
      </Link>

      <footer className="flex items-center gap-1 border-t border-[var(--border)] px-3 py-2.5 sm:px-4">
        <LikeButton
          {...(item.kind === "system" ? { templateId: item.id } : { characterId: item.id })}
          initialLiked={item.likedByMe}
          initialCount={item.likeCount}
          authenticated
          likeLabel={t("like", { title: item.title })}
          unlikeLabel={t("unlike", { title: item.title })}
          signInLabel={t("signIn")}
        />
        {item.kind === "system" && (
          <Link href={href} className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--brand)]">
            <MessageCircle className="size-4" /> {item.commentCount}
          </Link>
        )}
        <div className="ml-auto">
          <RemixButton kind={item.kind} itemId={item.id} initialRemixed={item.remixedByMe} compact />
        </div>
      </footer>
    </article>
  );
}

function SystemPreview({ title, pages }: { title: string; pages: number }) {
  return (
    <div className="mx-auto max-w-md rotate-[-1deg] rounded-xl border border-[#cfc4ef] bg-white p-4 shadow-[0_10px_25px_rgba(60,38,110,.09)] transition-transform group-hover:rotate-0 sm:p-5">
      <div className="flex items-center justify-between border-b border-[#e6e0f6] pb-3">
        <span className="max-w-[75%] truncate font-bold text-[#3f2c71]">{title}</span>
        <span className="text-[10px] font-bold tracking-wider text-[#786aa1] uppercase">d20</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {["СИЛ", "ЛОВ", "ИНТ"].map((label, index) => (
          <div key={label} className="rounded-lg border border-[#e6e0f6] p-2 text-center">
            <div className="text-[9px] font-bold text-[#786aa1]">{label}</div>
            <div className="mt-1 text-lg font-black text-[#3f2c71]">{[16, 12, 18][index]}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <div className="h-2 flex-1 rounded-full bg-[#e6e0f6]" />
        <div className="h-2 w-1/3 rounded-full bg-[#d6cbf2]" />
      </div>
      <p className="mt-3 text-right text-[10px] font-semibold text-[#786aa1]">{pages} стр.</p>
    </div>
  );
}

function CharacterPreview({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-[#bddbc3] bg-[var(--surface)] p-4 shadow-[0_10px_25px_rgba(15,62,23,.08)] transition-transform group-hover:-translate-y-0.5 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-full bg-[var(--brand)] font-black text-white">{title.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0">
          <div className="truncate text-lg font-black text-[var(--brand)]">{title}</div>
          <div className="text-xs text-[var(--muted)]">Лист персонажа</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {["КЗ", "ХИТЫ", "УРОВЕНЬ"].map((label, index) => (
          <div key={label} className="rounded-lg bg-[var(--keylime)] p-2.5 text-center">
            <div className="text-[9px] font-bold text-[var(--muted)]">{label}</div>
            <div className="mt-1 text-lg font-black text-[var(--brand)]">{[17, 42, 5][index]}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 h-2 rounded-full bg-[var(--brand-soft)]"><div className="h-full w-3/4 rounded-full bg-[var(--brand)]" /></div>
    </div>
  );
}
