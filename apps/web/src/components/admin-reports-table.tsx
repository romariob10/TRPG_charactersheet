"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ContentReport, ReportStatus } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import { formatRelativeDate } from "@/lib/utils";

export function AdminReportsTable({
  initialReports,
  initialPendingCount,
  locale,
}: {
  initialReports: ContentReport[];
  initialPendingCount: number;
  locale: string;
}) {
  const t = useTranslations("AdminConsole.reports");
  const [reports, setReports] = useState<ContentReport[]>(initialReports);
  const [pendingCount, setPendingCount] = useState<number>(initialPendingCount);
  const [activeTab, setActiveTab] = useState<"pending" | "resolved" | "dismissed" | "all">("pending");
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function fetchReportsForTab(tab: "pending" | "resolved" | "dismissed" | "all") {
    setActiveTab(tab);
    setLoading(true);
    setFeedback(null);
    try {
      const queryParam = tab === "all" ? "status=all" : `status=${tab}`;
      const res = await apiFetch<{ reports: ContentReport[]; totalPending: number }>(
        `/api/admin/reports?${queryParam}&limit=50`
      );
      setReports(res.reports);
      setPendingCount(res.totalPending);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to load reports" });
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(
    reportId: string,
    status: "resolved" | "dismissed",
    actionTaken: "none" | "delete_content"
  ) {
    setActionLoadingId(reportId);
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/reports/${reportId}/resolve`, {
        method: "PUT",
        body: JSON.stringify({
          status,
          actionTaken,
          resolutionNote: actionTaken === "delete_content" ? "Content removed by moderator." : "Reviewed by moderator.",
        }),
      });

      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? { ...r, status, resolvedAt: new Date().toISOString() }
            : r
        )
      );

      if (activeTab === "pending") {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
        setPendingCount((c) => Math.max(0, c - 1));
      }

      setFeedback({
        type: "success",
        message: status === "resolved" ? t("reportResolved") : t("reportDismissed"),
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Failed to resolve report",
      });
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div>
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={
            "mb-4 rounded-xl p-3 text-xs font-semibold sm:text-sm " +
            (feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200")
          }
        >
          {feedback.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--border)] pb-2">
        <button
          type="button"
          onClick={() => fetchReportsForTab("pending")}
          className={
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors " +
            (activeTab === "pending"
              ? "bg-[var(--brand)] text-white shadow-xs"
              : "text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--brand)]")
          }
        >
          <span>{t("tabPending", { count: pendingCount })}</span>
        </button>

        <button
          type="button"
          onClick={() => fetchReportsForTab("resolved")}
          className={
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors " +
            (activeTab === "resolved"
              ? "bg-[var(--brand)] text-white shadow-xs"
              : "text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--brand)]")
          }
        >
          <span>{t("tabResolved")}</span>
        </button>

        <button
          type="button"
          onClick={() => fetchReportsForTab("dismissed")}
          className={
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors " +
            (activeTab === "dismissed"
              ? "bg-[var(--brand)] text-white shadow-xs"
              : "text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--brand)]")
          }
        >
          <span>{t("tabDismissed")}</span>
        </button>

        <button
          type="button"
          onClick={() => fetchReportsForTab("all")}
          className={
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors " +
            (activeTab === "all"
              ? "bg-[var(--brand)] text-white shadow-xs"
              : "text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--brand)]")
          }
        >
          <span>{t("tabAll")}</span>
        </button>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2.5 font-bold uppercase">{t("target")}</th>
              <th className="px-3 py-2.5 font-bold uppercase">{t("reason")}</th>
              <th className="px-3 py-2.5 font-bold uppercase">{t("reporter")}</th>
              <th className="px-3 py-2.5 font-bold uppercase">{t("date")}</th>
              <th className="px-3 py-2.5 font-bold uppercase">{t("status")}</th>
              <th className="px-3 py-2.5 font-bold uppercase text-right">
                {t("actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
            {reports.length > 0 ? (
              reports.map((report) => (
                <tr key={report.id} className="hover:bg-[var(--keylime)]/20">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-md bg-[var(--keylime)] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[var(--brand)]">
                        {report.targetType}
                      </span>
                      <span className="font-mono text-xs text-[var(--muted)]">
                        {report.targetId.slice(0, 8)}...
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-bold text-[var(--foreground)]">
                      {report.reason}
                    </span>
                    {report.details && (
                      <p className="mt-0.5 text-xs text-[var(--muted)] line-clamp-1">
                        {report.details}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--muted)]">
                    {report.reporterUsername ? (
                      <Link
                        href={`/users/${report.reporterUsername}`}
                        className="font-semibold text-[var(--brand)] hover:underline"
                      >
                        @{report.reporterUsername}
                      </Link>
                    ) : (
                      "Anonymous / System"
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--muted)]">
                    {formatRelativeDate(report.createdAt, locale)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold " +
                        (report.status === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : report.status === "resolved"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-[var(--surface-subtle)] text-[var(--muted)]")
                      }
                    >
                      {report.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {report.status === "pending" && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={actionLoadingId === report.id}
                          onClick={() =>
                            handleResolve(report.id, "resolved", "delete_content")
                          }
                          title={t("resolveAndDelete")}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="size-3" />
                          <span className="hidden sm:inline">
                            {t("resolveAndDelete")}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={actionLoadingId === report.id}
                          onClick={() =>
                            handleResolve(report.id, "dismissed", "none")
                          }
                          title={t("dismiss")}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--foreground)]"
                        >
                          <XCircle className="size-3" />
                          <span className="hidden sm:inline">
                            {t("dismiss")}
                          </span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-[var(--muted)]"
                >
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
