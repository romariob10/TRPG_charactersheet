import Link from "next/link";
import { CircleUserRound, LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";
import { LanguageSwitch } from "@/components/language-switch";
import { AppTabs } from "@/components/app-tabs";
import { buttonClassName } from "@/components/ui/button";
import { signOut } from "@/app/auth/actions";
import { cn } from "@/lib/utils";

export async function SiteHeader({
  authenticated = false,
}: {
  authenticated?: boolean;
}) {
  const t = await getTranslations("Common");
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex h-[63px] max-w-7xl items-center gap-2.5 px-5 sm:px-8">
        <Logo />
        {authenticated && <AppTabs />}
        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitch />
          {authenticated && (
            <Link
              href="/dashboard/profile"
              aria-label={t("profileSettings")}
              className={cn(
                buttonClassName({ variant: "ghost", size: "sm" }),
              )}
            >
              <CircleUserRound className="size-4" />
              <span className="hidden sm:inline">{t("profileSettings")}</span>
            </Link>
          )}
          {authenticated && (
            <form action={signOut}>
              <button
                aria-label={t("signOut")}
                className={cn(
                  buttonClassName({ variant: "ghost", size: "sm" }),
                )}
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">{t("signOut")}</span>
              </button>
            </form>
          )}
          {!authenticated && (
            <Link
              href="/auth/sign-in"
              className={buttonClassName({ variant: "secondary", size: "sm" })}
            >
              {t("signIn")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
