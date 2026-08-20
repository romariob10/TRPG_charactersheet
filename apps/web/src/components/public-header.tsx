import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";
import { LanguageSwitch } from "@/components/language-switch";
import { buttonClassName } from "@/components/ui/button";

// Signed-out visitors reach public profiles, sheets and posts without a
// workspace sidebar, so they still need a minimal bar to sign in and pick a
// language.
export async function PublicHeader() {
  const t = await getTranslations("Common");
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex h-[63px] max-w-7xl items-center gap-2.5 px-3 sm:px-8">
        <Logo />
        <div className="ml-auto flex items-center gap-1.5">
          <LanguageSwitch />
          <Link
            href="/auth/sign-in"
            className={buttonClassName({ variant: "secondary", size: "sm" })}
          >
            {t("signIn")}
          </Link>
        </div>
      </div>
    </header>
  );
}
