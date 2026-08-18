import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, ShieldCheck, UserCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ProfileSettingsForm } from "@/components/profile-settings-form";
import { buttonClassName } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/server";
import { getSession } from "@/lib/auth";
import type { MyProfile } from "@/lib/types";

export default async function ProfileSettingsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/auth/sign-in");
  }

  const [t, profile] = await Promise.all([
    getTranslations("ProfileSettings"),
    apiFetch<MyProfile>("/api/profiles/me"),
  ]);

  const p = profile.data;
  const initials = (p.displayName ?? p.username)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="page-shell py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        {/* User Summary Card Header */}
        <div className="mb-6 overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xs">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid size-16 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-xl font-black text-[var(--brand)] shadow-xs">
                {initials}
              </div>
              <div>
                <h1 className="text-xl font-bold text-[var(--brand)] sm:text-2xl">
                  {p.displayName ?? "@" + p.username}
                </h1>
                <p className="text-xs font-semibold text-[var(--muted)] sm:text-sm">
                  @{p.username} · {p.email}
                </p>
                {p.isAdmin && (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                    <ShieldCheck className="size-3" /> Admin
                  </span>
                )}
              </div>
            </div>

            <Link
              href={"/users/" + p.username}
              className={buttonClassName({ variant: "secondary", size: "sm" }) + " shrink-0 gap-1.5"}
            >
              <ExternalLink className="size-3.5" />
              <span>{t("viewProfile")}</span>
            </Link>
          </div>
        </div>

        {/* Settings Form Card */}
        <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 shadow-xs">
          <div className="mb-6 border-b border-[var(--border)] pb-4">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-[var(--brand)] uppercase">
              <UserCheck className="size-4" />
              {t("title")}
            </div>
            <p className="mt-1 text-xs text-[var(--muted)] sm:text-sm">
              {t("subtitle")}
            </p>
          </div>

          <ProfileSettingsForm initial={p} />

          {p.isAdmin && (
            <div className="mt-8 border-t border-[var(--border)] pt-5">
              <Link
                href="/dashboard/admin"
                className={buttonClassName({ variant: "secondary", size: "md" })}
              >
                <ShieldCheck className="size-4" /> {t("openAdmin")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
