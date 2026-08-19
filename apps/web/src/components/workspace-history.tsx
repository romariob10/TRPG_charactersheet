"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  MessageSquare,
  Newspaper,
  Pin,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  ListWorkspaceHistoryResponse,
  WorkspaceItem,
} from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  post: Newspaper,
  conversation: MessageSquare,
  character: Users,
  system: BookOpen,
} as const;

export function WorkspaceHistory({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("Sidebar");
  const router = useRouter();
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = () => {
      apiFetch<ListWorkspaceHistoryResponse>("/api/workspace/history")
        .then((response) => {
          if (!cancelled) {
            setItems(response.items);
            setLoaded(true);
          }
        })
        .catch(() => {
          if (!cancelled) setLoaded(true);
        });
    };
    fetchOnce();
    const interval = setInterval(fetchOnce, 12000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function markSeen(item: WorkspaceItem) {
    setItems((previous) =>
      previous.map((entry) =>
        entry.id === item.id ? { ...entry, unread: false } : entry,
      ),
    );
    try {
      await apiFetch(`/api/workspace/history/${item.id}/seen`, {
        method: "PUT",
      });
    } catch {}
  }

  async function togglePin(item: WorkspaceItem) {
    const next = !item.pinned;
    setItems((previous) =>
      previous.map((entry) =>
        entry.id === item.id ? { ...entry, pinned: next } : entry,
      ),
    );
    try {
      await apiFetch(`/api/workspace/history/${item.id}/pin`, {
        method: "PUT",
        body: JSON.stringify({ pinned: next }),
      });
    } catch {}
  }

  function openItem(item: WorkspaceItem) {
    if (item.unread) void markSeen(item);
    if (item.url) router.push(item.url);
  }

  const pinned = items.filter((item) => item.pinned);
  const recent = items.filter((item) => !item.pinned);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      {loaded && items.length === 0 && (
        <p
          className={cn(
            "px-2 py-6 text-center text-xs text-[var(--muted)]",
            collapsed && "lg:hidden",
          )}
        >
          {t("historyEmpty")}
        </p>
      )}

      {pinned.length > 0 && !collapsed && (
        <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
          {t("historyPinned")}
        </p>
      )}
      {[...pinned, ...recent].map((item) => {
        const Icon = KIND_ICON[item.kind] ?? Newspaper;
        return (
          <div
            key={item.id}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-[var(--radius-control)] transition-colors",
              collapsed && "lg:justify-center",
            )}
          >
            <button
              type="button"
              onClick={() => openItem(item)}
              title={item.title ?? undefined}
              aria-label={item.title ?? item.kind}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left",
                collapsed && "lg:flex-none lg:px-0",
              )}
            >
              <span className="relative grid size-7 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--keylime)] text-[var(--brand)]">
                <Icon className="size-3.5" />
                {item.unread && (
                  <span
                    aria-label={t("historyUnread")}
                    className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-rose-500"
                  />
                )}
              </span>
              <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
                <span className="block truncate text-[13px] font-semibold text-[var(--foreground)]">
                  {item.title ?? "—"}
                </span>
                {item.subtitle && (
                  <span className="block truncate text-[11px] text-[var(--muted)]">
                    {item.subtitle}
                  </span>
                )}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void togglePin(item)}
              aria-label={item.pinned ? t("historyUnpin") : t("historyPin")}
              aria-pressed={item.pinned}
              title={item.pinned ? t("historyUnpin") : t("historyPin")}
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--brand)]",
                item.pinned
                  ? "text-[var(--brand)]"
                  : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                collapsed && "lg:hidden",
              )}
            >
              <Pin className={cn("size-3.5", item.pinned && "fill-current")} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
