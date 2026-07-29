"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function LanguageSwitch() {
  const locale = useLocale();
  const t = useTranslations("Common");

  async function switchLocale() {
    document.cookie = `locale=${locale === "ru" ? "en" : "ru"};path=/;max-age=31536000;samesite=lax`;
    window.location.reload();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={switchLocale}
      aria-label={t("language")}
      className="px-2.5"
    >
      <Languages className="size-4" />
      <span className="hidden sm:inline">{t("language")}</span>
    </Button>
  );
}
