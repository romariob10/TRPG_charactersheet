"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";

export function CreateSystemForm() {
  const t = useTranslations("Systems");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t("titleRequired"));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<{ id: string; defaultSheetId?: string }>("/api/game-systems", {
        method: "POST",
        body: JSON.stringify({
          title: trimmedTitle,
        }),
      });

      if (res?.defaultSheetId && res?.id) {
        router.push(`/dashboard/systems/${res.id}/sheets/${res.defaultSheetId}/builder`);
      } else if (res?.id) {
        router.push(`/dashboard/systems/${res.id}/workspace`);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : t("createError"),
      );
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-control)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]"
        >
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="system-title"
          className="block text-sm font-semibold text-[var(--foreground)]"
        >
          {t("systemTitleLabel")} *
        </label>
        <Input
          id="system-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("systemTitlePlaceholder")}
          required
          autoFocus
          disabled={loading}
          className="mt-2 text-base"
        />
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          {t("systemTitleHelp")}
        </p>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
          disabled={loading}
        >
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={loading || !title.trim()}>
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("subscribing")}
            </>
          ) : (
            <>
              {t("createAndOpenBuilder")}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
