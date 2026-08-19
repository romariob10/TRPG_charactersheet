import { Activity } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { AdminAuditEventsResponse } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/server";
import { AdminAuditTable } from "@/components/admin-audit-table";

export default async function AdminAuditPage() {
  const [auditData, t, locale] = await Promise.all([
    apiFetch<AdminAuditEventsResponse>("/api/admin/audit?limit=50"),
    getTranslations("AdminConsole.audit"),
    getLocale(),
  ]);

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-white">
          <Activity className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t("title")}</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <AdminAuditTable initialEvents={auditData.data.events} locale={locale} />
    </section>
  );
}
