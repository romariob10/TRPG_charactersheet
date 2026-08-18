import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { AdminOverviewResponse } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/server";
import { formatRelativeDate } from "@/lib/utils";

export default async function AdminOverviewPage() {
  const [overview, t, locale] = await Promise.all([
    apiFetch<AdminOverviewResponse>("/api/admin/overview"),
    getTranslations("AdminConsole.overview"),
    getLocale(),
  ]);

  const data = overview.data;

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Users */}
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--muted)] uppercase">
              {t("totalUsers")}
            </span>
            <span className="grid size-8 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
              <Users className="size-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-black text-[var(--brand)]">
            {data.users.total}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>
              +{data.users.newLast24h} {t("newUsers24h")}
            </span>
            <span>·</span>
            <span>
              +{data.users.newLast7d} {t("newUsers7d")}
            </span>
          </div>
        </div>

        {/* Posts Count */}
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--muted)] uppercase">
              {t("posts")}
            </span>
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <FileText className="size-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-black text-emerald-800">
            {data.content.posts}
          </div>
          <div className="mt-2 text-xs text-[var(--muted)]">
            {data.content.comments} {t("comments")}
          </div>
        </div>

        {/* RPG Systems & Characters */}
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--muted)] uppercase">
              {t("characters")}
            </span>
            <span className="grid size-8 place-items-center rounded-lg bg-indigo-50 text-indigo-700">
              <UserCheck className="size-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-black text-indigo-800">
            {data.content.characters}
          </div>
          <div className="mt-2 text-xs text-[var(--muted)]">
            {data.content.templates} {t("templates")}
          </div>
        </div>

        {/* AI & System State */}
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--muted)] uppercase">
              {t("aiStatus")}
            </span>
            <span className="grid size-8 place-items-center rounded-lg bg-amber-50 text-amber-700">
              <Sparkles className="size-4" />
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {data.system.aiConfigured ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                <CheckCircle2 className="size-4" /> {t("aiConfigured")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-700">
                <ShieldAlert className="size-4" /> {t("aiNotConfigured")}
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-[var(--muted)] capitalize">
            {data.system.aiProvider} · {data.system.nodeEnv}
          </div>
        </div>
      </div>

      {/* Recent Audit Events Section */}
      <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[var(--brand)] text-white">
              <Activity className="size-4" />
            </span>
            <div>
              <h2 className="text-base font-bold sm:text-lg">
                {t("recentAuditTitle")}
              </h2>
            </div>
          </div>
          <Link
            href="/dashboard/admin/audit"
            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand)] hover:underline sm:text-sm"
          >
            <span>{t("viewFullAudit")}</span>
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="mt-4 divide-y divide-[var(--border)]">
          {data.recentAudit.length > 0 ? (
            data.recentAudit.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between py-3 text-xs sm:text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-[var(--keylime)] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--brand)]">
                    {event.action}
                  </span>
                  <span className="font-semibold text-[var(--foreground)]">
                    {event.actorUsername ? `@${event.actorUsername}` : event.actorRole}
                  </span>
                  <span className="text-[var(--muted)]">→ {event.targetType}</span>
                </div>
                <span className="text-xs text-[var(--muted)]">
                  {formatRelativeDate(event.createdAt, locale)}
                </span>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-[var(--muted)]">
              {t("noAuditEvents")}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
