"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  FileText,
  Search as SearchIcon,
  Shield,
  User,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { SearchItem, SearchType } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import { formatRelativeDate } from "@/lib/utils";

export function SearchView({ locale }: { locale: string }) {
  const t = useTranslations("Search");
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialQuery = searchParams.get("q") ?? "";
  const initialType = (searchParams.get("type") as SearchType) ?? "all";

  const [query, setQuery] = useState(initialQuery);
  const [activeType, setActiveType] = useState<SearchType>(initialType);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(Boolean(initialQuery));

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch<{ results: SearchItem[]; total: number }>(
          `/api/search?q=${encodeURIComponent(query.trim())}&type=${activeType}`
        );
        setResults(data.results);
        setHasSearched(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, activeType]);

  const tabs: { id: SearchType; label: string; icon: any }[] = [
    { id: "all", label: t("tabAll"), icon: SearchIcon },
    { id: "post", label: t("tabPosts"), icon: FileText },
    { id: "character", label: t("tabCharacters"), icon: Users },
    { id: "template", label: t("tabTemplates"), icon: BookOpen },
    { id: "user", label: t("tabUsers"), icon: User },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[var(--foreground)] sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("subtitle")}</p>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--muted)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            const params = new URLSearchParams(searchParams.toString());
            if (e.target.value) params.set("q", e.target.value);
            else params.delete("q");
            router.replace(`?${params.toString()}`);
          }}
          placeholder={t("placeholder")}
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-3.5 pl-12 pr-4 text-base font-semibold shadow-sm outline-none transition-all placeholder:text-[var(--muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
          autoFocus
        />
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--border)] pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeType === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveType(tab.id);
                const params = new URLSearchParams(searchParams.toString());
                params.set("type", tab.id);
                router.replace(`?${params.toString()}`);
              }}
              className={
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap " +
                (isActive
                  ? "bg-[var(--brand)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--foreground)]")
              }
            >
              <Icon className="size-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Results state */}
      {loading ? (
        <div className="py-12 text-center text-sm font-semibold text-[var(--muted)]">
          {t("foundResults", { count: "…" })}
        </div>
      ) : hasSearched && results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] py-12 text-center">
          <p className="text-base font-bold text-[var(--foreground)]">
            {t("empty", { query })}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("emptyHint")}</p>
        </div>
      ) : !hasSearched ? (
        <div className="py-12 text-center text-sm text-[var(--muted)]">
          {t("startPrompt")}
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
            {t("foundResults", { count: results.length })}
          </div>
          {results.map((item) => (
            <Link
              key={`${item.type}-${item.id}`}
              href={item.url}
              className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-all hover:border-[var(--brand)] hover:shadow-md"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider " +
                      (item.type === "post"
                        ? "bg-blue-100 text-blue-800"
                        : item.type === "character"
                        ? "bg-purple-100 text-purple-800"
                        : item.type === "template"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800")
                    }
                  >
                    {item.type}
                  </span>
                  {item.author && (
                    <span className="text-xs font-semibold text-[var(--muted)]">
                      by @{item.author.username}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-[var(--foreground)]">
                  {item.title}
                </h3>
                {item.subtitle && (
                  <p className="line-clamp-2 text-xs text-[var(--muted)]">
                    {item.subtitle}
                  </p>
                )}
              </div>
              {item.createdAt && (
                <div className="shrink-0 text-right text-[11px] font-semibold text-[var(--muted)]">
                  {formatRelativeDate(item.createdAt, locale)}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
