import { getTranslations } from "next-intl/server";
import { ProfileSettingsForm } from "@/components/profile-settings-form";
import { apiFetch } from "@/lib/api/server";
import type { MyProfile } from "@/lib/types";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";

export default async function ProfileSettingsPage() {
  const [t, profile] = await Promise.all([
    getTranslations("ProfileSettings"),
    apiFetch<MyProfile>("/api/profiles/me"),
  ]);

  return (
    <main className="page-shell py-8">
      <h1 className="display-heading text-4xl text-[var(--brand)] sm:text-[2.75rem]">
        {t("title")}
      </h1>
      <p className="mt-2 max-w-2xl text-[var(--muted)]">{t("subtitle")}</p>
      <div className="mt-8 max-w-2xl rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="mb-5 text-sm text-[var(--muted)]">
          {t("emailNote", { email: profile.data.email })}
        </p>
        <ProfileSettingsForm initial={profile.data} />
        {profile.data.isAdmin && (
          <div className="mt-6 border-t border-[var(--border)] pt-5">
            <Link
              href="/dashboard/admin"
              className={buttonClassName({ variant: "secondary", size: "md" })}
            >
              <ShieldCheck className="size-4" /> {t("openAdmin")}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
