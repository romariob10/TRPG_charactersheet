import Link from "next/link";
import { BadgeCheck, Library, PanelsTopLeft, Trash2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

export async function SystemsSectionTabs({
  active,
}: {
  active: "mine" | "official" | "community" | "trash";
}) {
  const t = await getTranslations("Systems");
  const items = [
    {
      id: "mine" as const,
      href: "/dashboard/systems",
      label: t("mySystems"),
      icon: PanelsTopLeft,
    },
    {
      id: "official" as const,
      href: "/dashboard/systems/official",
      label: t("officialSystems"),
      icon: BadgeCheck,
    },
    {
      id: "community" as const,
      href: "/dashboard/systems/community",
      label: t("exploreCommunity"),
      icon: Library,
    },
    {
      id: "trash" as const,
      href: "/dashboard/systems/trash",
      label: t("trashTab"),
      icon: Trash2,
    },
  ];
  return (
    <nav className="mt-7 flex w-fit rounded-[var(--radius-control)] bg-[var(--keylime)] p-1">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              "flex h-9 items-center gap-2 rounded-[7px] px-3 text-sm font-semibold transition-colors",
              active === item.id
                ? "bg-[var(--surface)] text-[var(--brand)]"
                : "text-[var(--muted)] hover:text-[var(--brand)]",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
