import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { AppSidebar } from "@/components/app-sidebar";
import { PublicHeader } from "@/components/public-header";
import { getSession } from "@/lib/auth";
import { getMyProfile } from "@/lib/profile";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) {
    return (
      <div className="min-h-screen">
        <PublicHeader />
        {children}
      </div>
    );
  }

  const [profile, locale, cookieStore] = await Promise.all([
    getMyProfile(),
    getLocale(),
    cookies(),
  ]);

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        profile={{
          username: profile.username,
          displayName: profile.displayName,
          siteRole: profile.siteRole,
        }}
        locale={locale}
        initialCollapsed={cookieStore.get("sidebar_collapsed")?.value === "1"}
        initialIsDark={cookieStore.get("theme")?.value === "dark"}
      />
      {/* Narrow screens keep the drawer trigger floating, so reserve room for it. */}
      <div className="min-w-0 flex-1 pt-14 lg:pt-0">{children}</div>
    </div>
  );
}
