"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Compass,
  Languages,
  LogOut,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  SquarePen,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { Popover, PopoverItem } from "@/components/ui/popover";
import { WorkspaceHistory } from "@/components/workspace-history";
import { signOut } from "@/app/auth/actions";
import { cn } from "@/lib/utils";

const COLLAPSED_COOKIE = "sidebar_collapsed";

export interface SidebarProfile {
  username: string;
  displayName: string | null;
  siteRole: string;
}

export function AppSidebar({
  profile,
  locale,
  initialCollapsed,
  initialIsDark,
}: {
  profile: SidebarProfile;
  locale: string;
  initialCollapsed: boolean;
  initialIsDark: boolean;
}) {
  const t = useTranslations("Common");
  const tSidebar = useTranslations("Sidebar");
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(initialIsDark);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    document.cookie = `theme=${next ? "dark" : "light"};path=/;max-age=31536000;samesite=lax`;
    if (next) {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
  }

  // Hovering the collapsed header reveals the expand control in the logo's
  // place. Tracked in state so the control is focusable and testable, not a
  // CSS-only trick.
  const [headerHover, setHeaderHover] = useState(false);

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      document.cookie = `${COLLAPSED_COOKIE}=${next ? "1" : "0"};path=/;max-age=31536000;samesite=lax`;
      return next;
    });
  }

  const items = [
    { href: "/dashboard/search", label: t("search"), icon: Search },
    { href: "/dashboard/feed", label: t("feed"), icon: Compass },
    { href: "/dashboard/messages", label: t("messages"), icon: MessageSquare },
    { href: "/dashboard", label: t("characters"), icon: Users, exact: true },
    { href: "/dashboard/systems", label: t("systems"), icon: BookOpen },
  ];

  function isActive(href: string, exact?: boolean) {
    if (exact) {
      return (
        pathname === href ||
        pathname.startsWith("/dashboard/new") ||
        pathname.startsWith("/characters/")
      );
    }
    return pathname.startsWith(href);
  }

  const canModerate =
    profile.siteRole === "admin" || profile.siteRole === "moderator";

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label={tSidebar("openNavigation")}
        aria-expanded={mobileOpen}
        className="fixed left-3 top-3 z-40 grid size-10 place-items-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[var(--brand)] shadow-sm lg:hidden"
      >
        <PanelLeftOpen className="size-5" />
      </button>

      {mobileOpen && (
        <div
          role="presentation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/35 lg:hidden"
        />
      )}

      <aside
        aria-label={tSidebar("navigation")}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          collapsed ? "lg:w-[3.25rem]" : "lg:w-64",
          "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          data-testid="sidebar-header"
          className={cn(
            "flex h-[63px] shrink-0 items-center gap-1 border-b border-[var(--border)] px-3",
            collapsed && "lg:justify-center lg:px-1.5",
          )}
          onMouseEnter={() => setHeaderHover(true)}
          onMouseLeave={() => setHeaderHover(false)}
        >
          {collapsed ? (
            headerHover ? (
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={tSidebar("expand")}
                title={tSidebar("expand")}
                className="grid size-8 place-items-center rounded-[var(--radius-control)] text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--brand)]"
              >
                <PanelLeftOpen className="size-4" />
              </button>
            ) : (
              <Logo
                href="/dashboard/feed"
                className="min-w-0"
                labelClassName="lg:hidden"
              />
            )
          ) : (
            <>
              <Logo
                href="/dashboard/feed"
                className="min-w-0"
                labelClassName="truncate"
              />
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={tSidebar("collapse")}
                title={tSidebar("collapse")}
                className="ml-auto grid size-8 place-items-center rounded-[var(--radius-control)] text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--brand)]"
              >
                <PanelLeftClose className="size-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label={tSidebar("closeNavigation")}
            className="ml-auto grid size-8 place-items-center rounded-[var(--radius-control)] text-[var(--muted)] hover:bg-[var(--keylime)] lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav
          aria-label={tSidebar("primary")}
          className="shrink-0 space-y-0.5 p-2"
        >
          <Link
            href="/dashboard/posts/new"
            target="_blank"
            rel="noreferrer"
            onClick={() => setMobileOpen(false)}
            title={collapsed ? tSidebar("newArticle") : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-2.5 text-[13px] font-semibold text-[var(--brand)] transition-colors hover:bg-[var(--brand-soft)]",
              collapsed && "lg:justify-center lg:px-0",
            )}
          >
            <SquarePen className="size-4 shrink-0" />
            <span className={cn("truncate", collapsed && "lg:hidden")}>
              {tSidebar("newArticle")}
            </span>
          </Link>
          <div className="mb-1.5 mt-0.5 border-t border-[var(--border)]" />

          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-2.5 text-[13px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--brand)]",
                  active && "bg-[var(--keylime)] text-[var(--brand)]",
                  collapsed && "lg:justify-center lg:px-0",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className={cn("truncate", collapsed && "lg:hidden")}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {(!collapsed || mobileOpen) && <WorkspaceHistory collapsed={false} />}

        <div
          data-testid="sidebar-footer"
          className="mt-auto shrink-0 border-t border-[var(--border)] p-2"
        >
          <div
            className={cn(
              "flex items-center gap-1",
              collapsed && "lg:flex-col lg:items-stretch",
            )}
          >
            <div
              className={cn(
                "flex items-center",
                collapsed && "lg:justify-center",
              )}
            >
              <NotificationBell
                locale={locale}
                dropSide={collapsed ? "right" : "up"}
              />
            </div>

            <Popover
              label={t("language")}
              align="start"
              className={cn(collapsed && "lg:w-full")}
              trigger={() => (
                <span
                  title={t("language")}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-[var(--radius-control)] px-2 text-[11px] font-bold text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--brand)]",
                    collapsed && "lg:justify-center lg:px-0",
                  )}
                >
                  <Languages className="size-4 shrink-0" />
                  <span className={cn(collapsed && "lg:hidden")}>
                    {locale.toUpperCase()}
                  </span>
                </span>
              )}
            >
              {({ close }) => (
                <>
                  <LanguageOption
                    target="ru"
                    active={locale === "ru"}
                    label={t("languageRu")}
                    onDone={close}
                  />
                  <LanguageOption
                    target="en"
                    active={locale === "en"}
                    label={t("languageEn")}
                    onDone={close}
                  />
                </>
              )}
            </Popover>

            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? t("themeLight") : t("themeDark")}
              aria-label={isDark ? t("themeLight") : t("themeDark")}
              className={cn(
                "flex h-8 items-center gap-2 rounded-[var(--radius-control)] px-2 text-[11px] font-bold text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--brand)]",
                collapsed && "lg:justify-center lg:px-0",
              )}
            >
              {isDark ? (
                <Sun className="size-4 shrink-0" />
              ) : (
                <Moon className="size-4 shrink-0" />
              )}
              <span className={cn(collapsed && "lg:hidden")}>
                {isDark ? t("themeLight") : t("themeDark")}
              </span>
            </button>
          </div>

          <Popover
            label={tSidebar("account")}
            align="start"
            className="mt-1"
            trigger={() => (
              <span
                className={cn(
                  "flex h-11 items-center gap-2.5 rounded-[var(--radius-control)] px-2 transition-colors hover:bg-[var(--keylime)]",
                  collapsed && "lg:justify-center lg:px-0",
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-xs font-black text-[var(--brand)]">
                  {(profile.displayName ?? profile.username)
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-[var(--foreground)]",
                    collapsed && "lg:hidden",
                  )}
                >
                  {profile.displayName ?? profile.username}
                </span>
              </span>
            )}
          >
            {({ close }) => (
              <>
                <Link
                  href="/dashboard/profile"
                  onClick={close}
                  className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-[13px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--keylime)]"
                >
                  <Settings className="size-4" />
                  {t("profileSettings")}
                </Link>
                <Link
                  href={`/users/${profile.username}`}
                  onClick={close}
                  className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-[13px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--keylime)]"
                >
                  <Users className="size-4" />
                  {t("viewPublicProfile")}
                </Link>
                {canModerate && (
                  <Link
                    href="/dashboard/admin"
                    onClick={close}
                    className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-[13px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--keylime)]"
                  >
                    <ShieldCheck className="size-4" />
                    {tSidebar("adminConsole")}
                  </Link>
                )}
                <div className="my-1 border-t border-[var(--border)]" />
                <form action={signOut}>
                  <PopoverItem type="submit">
                    <LogOut className="size-4" />
                    {t("signOut")}
                  </PopoverItem>
                </form>
              </>
            )}
          </Popover>
        </div>
      </aside>
    </>
  );
}

function LanguageOption({
  target,
  active,
  label,
  onDone,
}: {
  target: "ru" | "en";
  active: boolean;
  label: string;
  onDone: () => void;
}) {
  return (
    <PopoverItem
      aria-pressed={active}
      onClick={() => {
        onDone();
        if (active) return;
        document.cookie = `locale=${target};path=/;max-age=31536000;samesite=lax`;
        window.location.reload();
      }}
      className={active ? "text-[var(--brand)]" : undefined}
    >
      <span className="w-7 text-[11px] font-black">{target.toUpperCase()}</span>
      <span className="flex-1">{label}</span>
      {active && <span aria-hidden="true">•</span>}
    </PopoverItem>
  );
}
