"use client";

import { useEffect } from "react";
import Link from "next/link";
import { FileSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, buttonClassName } from "@/components/ui/button";
import type { TemplateEditorData } from "@/lib/types";

export function TemplateProcessing({
  template,
}: {
  template: TemplateEditorData;
}) {
  const router = useRouter();
  const t = useTranslations("Systems");
  const progress = 8;
  const step = t("processingStep");

  useEffect(() => {
    if (template.catalogStatus === "failed") return;
    const poll = window.setInterval(() => router.refresh(), 15_000);
    return () => {
      window.clearInterval(poll);
    };
  }, [router, template.catalogStatus, template.id]);

  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-[var(--keylime)] p-6">
      <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-7 text-center sm:p-8">
        <div className="mx-auto grid size-14 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]">
          <FileSearch className="size-7" />
        </div>
        <h1 className="display-heading mt-6 text-3xl text-[var(--brand)]">
          {t("processingTitle", { name: template.title })}
        </h1>
        <p className="mt-2 text-[var(--muted)]">{t("processingText")}</p>
        {template.catalogStatus === "failed" ? (
          <div className="mt-7 flex justify-center gap-3">
            <Link
              href="/dashboard/systems"
              className={buttonClassName({ variant: "secondary" })}
            >
              {t("back")}
            </Link>
            <Button onClick={() => window.location.reload()}>
              {t("retry")}
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-7 h-2 overflow-hidden rounded-full bg-black/8">
              <div
                className="h-full rounded-full bg-[var(--brand)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-3 text-sm text-[var(--muted)]">{step}</div>
          </>
        )}
      </div>
    </main>
  );
}
