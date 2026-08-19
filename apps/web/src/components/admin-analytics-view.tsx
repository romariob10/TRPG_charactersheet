"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  FileText,
  Heart,
  MessageSquare,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { AnalyticsPeriod, AnalyticsSummary, TimeSeriesPoint } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";

export function AdminAnalyticsView({
  initialSummary,
}: {
  initialSummary: AnalyticsSummary;
}) {
  const t = useTranslations("AdminConsole.analytics");
  const [period, setPeriod] = useState<AnalyticsPeriod>(initialSummary.period);
  const [summary, setSummary] = useState<AnalyticsSummary>(initialSummary);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (period === initialSummary.period && summary === initialSummary) return;
    let isMounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch<AnalyticsSummary>(`/api/admin/analytics?period=${period}`);
        if (isMounted) setSummary(res);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [period]);

  const periods: { id: AnalyticsPeriod; label: string }[] = [
    { id: "7d", label: t("period7d") },
    { id: "30d", label: t("period30d") },
    { id: "90d", label: t("period90d") },
  ];

  const maxUsers = Math.max(...summary.userGrowth.map((p) => p.count), 1);
  const maxPosts = Math.max(...summary.postVelocity.map((p) => p.count), 1);

  return (
    <div className="space-y-6">
      {/* Header & Period Switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)] sm:text-2xl">
            {t("title")}
          </h1>
          <p className="text-xs text-[var(--muted)]">{t("subtitle")}</p>
        </div>

        <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              disabled={loading}
              className={
                "rounded-lg px-3 py-1.5 text-xs font-bold transition-colors " +
                (period === p.id
                  ? "bg-[var(--brand)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--foreground)]")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Users */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
            <Users className="size-4 text-blue-600" />
            <span>{t("metricUsers")}</span>
          </div>
          <p className="mt-2 text-2xl font-black text-[var(--foreground)]">
            {summary.totalUsers}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-emerald-600">
            {t("newInPeriod", { count: summary.newUsers })}
          </p>
        </div>

        {/* Posts */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
            <FileText className="size-4 text-indigo-600" />
            <span>{t("metricPosts")}</span>
          </div>
          <p className="mt-2 text-2xl font-black text-[var(--foreground)]">
            {summary.totalPosts}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-emerald-600">
            {t("newInPeriod", { count: summary.newPosts })}
          </p>
        </div>

        {/* Characters */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
            <Users className="size-4 text-purple-600" />
            <span>{t("metricCharacters")}</span>
          </div>
          <p className="mt-2 text-2xl font-black text-[var(--foreground)]">
            {summary.totalCharacters}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-emerald-600">
            {t("newInPeriod", { count: summary.newCharacters })}
          </p>
        </div>

        {/* Systems */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
            <BookOpen className="size-4 text-emerald-600" />
            <span>{t("metricSystems")}</span>
          </div>
          <p className="mt-2 text-2xl font-black text-[var(--foreground)]">
            {summary.totalTemplates}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-[var(--muted)]">
            Cataloged & Public
          </p>
        </div>

        {/* Engagement */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
            <Heart className="size-4 text-rose-600" />
            <span>{t("metricEngagement")}</span>
          </div>
          <p className="mt-2 text-2xl font-black text-[var(--foreground)]">
            {summary.totalReactions + summary.totalComments}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-[var(--muted)]">
            {summary.totalReactions} reacts · {summary.totalComments} cmts
          </p>
        </div>

        {/* Moderation */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
            <ShieldAlert className="size-4 text-amber-600" />
            <span>{t("metricModeration")}</span>
          </div>
          <p className="mt-2 text-2xl font-black text-[var(--foreground)]">
            {summary.totalReports}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-amber-600">
            {summary.pendingReports} pending
          </p>
        </div>
      </div>

      {/* Sparkline / Bar Chart Visualizations */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Growth Chart */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <h2 className="text-sm font-bold text-[var(--foreground)]">
              {t("userGrowthTitle")}
            </h2>
            <span className="text-xs font-semibold text-emerald-600">
              +{summary.newUsers} total
            </span>
          </div>

          <div className="mt-4">
            {summary.userGrowth.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--muted)]">
                No registrations in this period
              </div>
            ) : (
              <div className="flex h-40 items-end gap-1.5 pt-4">
                {summary.userGrowth.map((point) => {
                  const heightPercent = Math.max((point.count / maxUsers) * 100, 8);
                  return (
                    <div
                      key={point.date}
                      className="group relative flex flex-1 flex-col items-center h-full justify-end"
                    >
                      {/* Tooltip */}
                      <div className="absolute -top-7 hidden rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold text-white group-hover:block z-10 whitespace-nowrap">
                        {point.date}: {point.count}
                      </div>
                      {/* Bar */}
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className="w-full rounded-t-md bg-blue-500 transition-all hover:bg-blue-600"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Post Velocity Chart */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <h2 className="text-sm font-bold text-[var(--foreground)]">
              {t("postVelocityTitle")}
            </h2>
            <span className="text-xs font-semibold text-indigo-600">
              +{summary.newPosts} total
            </span>
          </div>

          <div className="mt-4">
            {summary.postVelocity.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--muted)]">
                No posts published in this period
              </div>
            ) : (
              <div className="flex h-40 items-end gap-1.5 pt-4">
                {summary.postVelocity.map((point) => {
                  const heightPercent = Math.max((point.count / maxPosts) * 100, 8);
                  return (
                    <div
                      key={point.date}
                      className="group relative flex flex-1 flex-col items-center h-full justify-end"
                    >
                      {/* Tooltip */}
                      <div className="absolute -top-7 hidden rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold text-white group-hover:block z-10 whitespace-nowrap">
                        {point.date}: {point.count}
                      </div>
                      {/* Bar */}
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className="w-full rounded-t-md bg-indigo-500 transition-all hover:bg-indigo-600"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
