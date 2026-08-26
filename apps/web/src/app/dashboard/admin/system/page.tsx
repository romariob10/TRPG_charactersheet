import { CheckCircle2, Cpu, Database, HardDrive, ShieldAlert, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AdminOverviewResponse, GameSystemSummary } from "@mycharacter/contracts";
import { AdminOfficialSystems } from "@/components/admin-official-systems";
import { apiFetch } from "@/lib/api/server";

export default async function AdminSystemPage() {
  const [overview, systems, t] = await Promise.all([
    apiFetch<AdminOverviewResponse>("/api/admin/overview"),
    apiFetch<GameSystemSummary[]>("/api/admin/game-systems"),
    getTranslations("AdminConsole.system"),
  ]);

  const data = overview.data;

  return (
    <section className="space-y-6 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-white">
          <Cpu className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t("title")}</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Database */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
          <div className="flex items-center justify-between">
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
              <Database className="size-4" />
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="size-3.5" /> {t("statusOk")}
            </span>
          </div>
          <h3 className="mt-3 font-bold">{t("database")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            {t("databaseDesc")}
          </p>
        </div>

        {/* Storage */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
          <div className="flex items-center justify-between">
            <span className="grid size-8 place-items-center rounded-lg bg-indigo-100 text-indigo-800">
              <HardDrive className="size-4" />
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
              <CheckCircle2 className="size-3.5" /> {t("statusOk")}
            </span>
          </div>
          <h3 className="mt-3 font-bold">{t("storage")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            {t("storageDesc")}
          </p>
        </div>

        {/* AI Integration */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
          <div className="flex items-center justify-between">
            <span className="grid size-8 place-items-center rounded-lg bg-amber-100 text-amber-800">
              <Sparkles className="size-4" />
            </span>
            {data.system.aiConfigured ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="size-3.5" /> {t("statusOk")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                <ShieldAlert className="size-3.5" /> {t("statusWarning")}
              </span>
            )}
          </div>
          <h3 className="mt-3 font-bold">{t("ai")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            {data.system.aiConfigured
              ? t("aiDesc") + ` (${data.system.aiProvider})`
              : t("aiDescNone")}
          </p>
        </div>
      </div>

      <AdminOfficialSystems initialSystems={systems.data} />
    </section>
  );
}
