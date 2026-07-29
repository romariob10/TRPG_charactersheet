"use client";

import Link from "next/link";
import { BookOpen, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function AppTabs() {
  const pathname = usePathname();
  const t = useTranslations("Common");
  const tabs = [
    {
      href: "/dashboard",
      label: t("characters"),
      icon: Users,
      active:
        pathname === "/dashboard" ||
        pathname.startsWith("/dashboard/new") ||
        pathname.startsWith("/characters/"),
    },
    {
      href: "/dashboard/systems",
      label: t("systems"),
      icon: BookOpen,
      active: pathname.startsWith("/dashboard/systems"),
    },
  ];

  return (
    <nav className="flex items-center rounded-[var(--radius-control)] bg-[var(--keylime)] p-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex h-8 items-center gap-2 rounded-[7px] px-2.5 text-[13px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--brand)]",
              tab.active && "bg-[var(--surface)] text-[var(--brand)]",
            )}
          >
            <Icon className="size-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
