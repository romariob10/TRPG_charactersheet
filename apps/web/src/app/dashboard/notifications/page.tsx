import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { ListNotificationsResponse } from "@mycharacter/contracts";
import { NotificationsView } from "@/components/notifications-view";
import { apiFetch } from "@/lib/api/server";
import { getSession } from "@/lib/auth";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/auth/sign-in");
  }

  const [notificationsRes, locale] = await Promise.all([
    apiFetch<ListNotificationsResponse>("/api/notifications?limit=50"),
    getLocale(),
  ]);

  return (
    <main className="page-shell py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <NotificationsView initialData={notificationsRes.data} locale={locale} />
      </div>
    </main>
  );
}
