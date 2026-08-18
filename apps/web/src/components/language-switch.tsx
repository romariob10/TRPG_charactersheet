"use client";

import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";

export function LanguageSwitch() {
  const locale = useLocale();
  const t = useTranslations("Common");

  function setLanguage(target: "ru" | "en") {
    if (target === locale) return;
    document.cookie = `locale=${target};path=/;max-age=31536000;samesite=lax`;
    window.location.reload();
  }

  return (
    <div
      role="group"
      aria-label={t("language")}
      className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs font-semibold shadow-xs"
    >
      <span className="sr-only">{t("language")}</span>
      <div className="grid size-7 place-items-center text-[var(--muted)] pl-0.5">
        <Languages className="size-3.5" />
      </div>
      <button
        type="button"
        onClick={() => setLanguage("ru")}
        className={cn(
          "h-6 rounded-full px-2 text-[11px] font-bold transition-colors",
          locale === "ru"
            ? "bg-[var(--brand)] text-white shadow-xs"
            : "text-[var(--muted)] hover:text-[var(--brand)]"
        )}
        aria-pressed={locale === "ru"}
      >
        RU
      </button>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={cn(
          "h-6 rounded-full px-2 text-[11px] font-bold transition-colors",
          locale === "en"
            ? "bg-[var(--brand)] text-white shadow-xs"
            : "text-[var(--muted)] hover:text-[var(--brand)]"
        )}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
    </div>
  );
}
