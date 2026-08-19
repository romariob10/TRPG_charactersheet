import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  Cpu,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { apiFetch } from "@/lib/api/server";
import { getSession } from "@/lib/auth";
import type { MyProfile } from "@/lib/types";
import { AdminNavTabs } from "@/components/admin-nav-tabs";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/auth/sign-in");
  }

  const [profile, t] = await Promise.all([
    apiFetch<MyProfile>("/api/profiles/me"),
    getTranslations("AdminConsole"),
  ]);

  const p = profile.data;
  if (p.siteRole !== "admin" && p.siteRole !== "moderator") {
    notFound();
  }

  return (
    <main className="page-shell py-6 sm:py-9">
      <div className="mx-auto max-w-5xl">
        {/* Admin Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-[.13em] text-[var(--brand)] uppercase">
              <ShieldCheck className="size-4" /> {t("eyebrow")}
            </div>
            <h1 className="display-heading mt-1 text-3xl text-[var(--brand)] sm:text-4xl">
              {t("title")}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              {t("subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={
                p.siteRole === "admin"
                  ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800"
                  : "inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800"
              }
            >
              <ShieldCheck className="size-3.5" />
              {p.siteRole === "admin" ? "Administrator" : "Moderator"}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6">
          <AdminNavTabs role={p.siteRole} />
        </div>

        {/* Page Content */}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
