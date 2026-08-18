"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Cpu,
  LayoutDashboard,
  Sparkles,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SiteRole } from "@/lib/types";

export function AdminNavTabs({ role }: { role: SiteRole }) {
  const pathname = usePathname();
  const t = useTranslations("AdminConsole.nav");

  const tabs = [
    {
      href: "/dashboard/admin/overview",
      label: t("overview"),
      icon: LayoutDashboard,
      roles: ["admin", "moderator"] as SiteRole[],
    },
    {
      href: "/dashboard/admin/users",
      label: t("users"),
      icon: Users,
      roles: ["admin", "moderator"] as SiteRole[],
    },
    {
      href: "/dashboard/admin/audit",
      label: t("audit"),
      icon: Activity,
      roles: ["admin", "moderator"] as SiteRole[],
    },
    {
      href: "/dashboard/admin/ai-settings",
      label: t("aiSettings"),
      icon: Sparkles,
      roles: ["admin"] as SiteRole[],
    },
    {
      href: "/dashboard/admin/system",
      label: t("system"),
      icon: Cpu,
      roles: ["admin", "moderator"] as SiteRole[],
    },
  ];

  const visibleTabs = tabs.filter((tab) => tab.roles.includes(role));

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-1.5">
      {visibleTabs.map((tab) => {
        const isActive =
          pathname === tab.href ||
          (tab.href !== "/dashboard/admin/overview" &&
            pathname?.startsWith(tab.href));
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors sm:text-sm",
              isActive
                ? "bg-[var(--brand)] text-white shadow-xs"
                : "text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--brand)]"
            )}
          >
            <Icon className="size-4" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
