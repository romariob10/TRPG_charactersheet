import { Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { AdminUsersListResponse } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/server";
import type { MyProfile } from "@/lib/types";
import { AdminUsersTable } from "@/components/admin-users-table";

export default async function AdminUsersPage() {
  const [usersData, myProfile, t, locale] = await Promise.all([
    apiFetch<AdminUsersListResponse>("/api/admin/users?limit=50"),
    apiFetch<MyProfile>("/api/profiles/me"),
    getTranslations("AdminConsole.users"),
    getLocale(),
  ]);

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-white">
          <Users className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t("title")}</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <AdminUsersTable
        initialUsers={usersData.data.users}
        currentUserRole={myProfile.data.siteRole}
        currentUserId={myProfile.data.id}
        locale={locale}
      />
    </section>
  );
}
