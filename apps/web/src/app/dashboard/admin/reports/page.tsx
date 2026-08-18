import { ShieldAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ContentReportsListResponse } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/server";
import { AdminReportsTable } from "@/components/admin-reports-table";

export default async function AdminReportsPage() {
  const [reportsData, t, locale] = await Promise.all([
    apiFetch<ContentReportsListResponse>("/api/admin/reports?status=pending&limit=50"),
    getTranslations("AdminConsole.reports"),
    getLocale(),
  ]);

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-600 text-white">
          <ShieldAlert className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t("title")}</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <AdminReportsTable
        initialReports={reportsData.data.reports}
        initialPendingCount={reportsData.data.totalPending}
        locale={locale}
      />
    </section>
  );
}
