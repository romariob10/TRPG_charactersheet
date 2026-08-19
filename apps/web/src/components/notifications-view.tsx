"use client";

import { useState } from "react";
import { Bell, CheckCheck, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ListNotificationsResponse, NotificationItem } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import { formatRelativeDate } from "@/lib/utils";

export function NotificationsView({
  initialData,
  locale,
}: {
  initialData: ListNotificationsResponse;
  locale: string;
}) {
  const t = useTranslations("Notifications");
  const [data, setData] = useState<ListNotificationsResponse>(initialData);
  const [marking, setMarking] = useState(false);

  async function handleMarkAllRead() {
    setMarking(true);
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
    } finally {
      setMarking(false);
    }
  }

  async function handleMarkRead(id: string) {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "PUT" });
      setData((prev) => ({
        ...prev,
        unreadCount: Math.max(prev.unreadCount - 1, 0),
        notifications: prev.notifications.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n
        ),
      }));
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--foreground)] sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("subtitle")}</p>
        </div>
        {data.unreadCount > 0 && (
          <button
            type="button"
            disabled={marking}
            onClick={() => void handleMarkAllRead()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-bold text-[var(--brand)] shadow-sm hover:bg-[var(--keylime)]"
          >
            <CheckCheck className="size-4" />
            <span>{t("markAllRead")}</span>
          </button>
        )}
      </div>

      {data.notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] py-16 text-center">
          <Bell className="mx-auto size-8 text-[var(--muted)] opacity-50" />
          <p className="mt-3 text-base font-bold text-[var(--foreground)]">
            {t("empty")}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          {data.notifications.map((n) => {
            const isUnread = !n.readAt;
            return (
              <div
                key={n.id}
                onClick={() => {
                  if (isUnread) void handleMarkRead(n.id);
                }}
                className={
                  "flex items-start justify-between gap-4 p-4 transition-colors " +
                  (isUnread ? "bg-[var(--brand-soft)]/30 hover:bg-[var(--brand-soft)]/60" : "hover:bg-[var(--keylime)]/40")
                }
              >
                <div className="flex items-start gap-3">
                  {isUnread ? (
                    <div className="mt-1 size-2 rounded-full bg-[var(--brand)] shrink-0" />
                  ) : (
                    <div className="mt-1 size-2 rounded-full bg-transparent shrink-0" />
                  )}
                  <div>
                    <h3 className="text-sm font-bold text-[var(--foreground)]">
                      {n.title}
                    </h3>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {n.actorUsername ? `@${n.actorUsername} ` : ""}
                        {n.body}
                      </p>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-[var(--muted)]">
                  {formatRelativeDate(n.createdAt, locale)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
