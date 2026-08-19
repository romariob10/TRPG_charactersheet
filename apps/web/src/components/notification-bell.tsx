"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ListNotificationsResponse, NotificationItem } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import { formatRelativeDate } from "@/lib/utils";

export function NotificationBell({ locale }: { locale: string }) {
  const t = useTranslations("Notifications");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ListNotificationsResponse>({
    notifications: [],
    unreadCount: 0,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  async function loadNotifications() {
    try {
      const res = await apiFetch<ListNotificationsResponse>("/api/notifications?limit=8");
      setData(res);
    } catch {}
  }

  useEffect(() => {
    let cancelled = false;
    void apiFetch<ListNotificationsResponse>("/api/notifications?limit=8")
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch(() => undefined);
    const interval = setInterval(() => {
      void loadNotifications();
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  async function handleMarkAllRead() {
    try {
      await apiFetch("/api/notifications/read-all", { method: "PUT" });
      setData((prev) => ({
        ...prev,
        unreadCount: 0,
        notifications: prev.notifications.map((n) => ({
          ...n,
          readAt: n.readAt ?? new Date().toISOString(),
        })),
      }));
    } catch {}
  }

  async function handleItemClick(item: NotificationItem) {
    if (!item.readAt) {
      try {
        await apiFetch(`/api/notifications/${item.id}/read`, { method: "PUT" });
        setData((prev) => ({
          ...prev,
          unreadCount: Math.max(prev.unreadCount - 1, 0),
          notifications: prev.notifications.map((n) =>
            n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n
          ),
        }));
      } catch {}
    }
    setOpen(false);
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) void loadNotifications();
        }}
        aria-label={t("title")}
        title={t("title")}
        className="relative grid size-8 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--foreground)]"
      >
        <Bell className="size-4" />
        {data.unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-sm">
            {data.unreadCount > 9 ? "9+" : data.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5 px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
              {t("title")}
            </span>
            {data.unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)] hover:underline"
              >
                <CheckCheck className="size-3.5" />
                <span>{t("markAllRead")}</span>
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border)] py-1">
            {data.notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--muted)]">
                {t("empty")}
              </div>
            ) : (
              data.notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => void handleItemClick(n)}
                  className={
                    "flex flex-col gap-1 p-2.5 rounded-xl cursor-pointer transition-colors " +
                    (!n.readAt
                      ? "bg-[var(--brand-soft)]/50 hover:bg-[var(--brand-soft)]"
                      : "hover:bg-[var(--keylime)]")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--foreground)]">
                      {n.title}
                    </span>
                    <span className="text-[10px] font-medium text-[var(--muted)]">
                      {formatRelativeDate(n.createdAt, locale)}
                    </span>
                  </div>
                  {n.body && (
                    <p className="text-xs text-[var(--muted)] line-clamp-2">
                      {n.actorUsername ? `@${n.actorUsername} ` : ""}
                      {n.body}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-[var(--border)] pt-2 text-center">
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--brand)] hover:underline"
            >
              <span>{t("viewAll")}</span>
              <ExternalLink className="size-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
