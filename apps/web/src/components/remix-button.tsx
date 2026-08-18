"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, GitFork, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { Button, buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RemixButton({
  kind,
  itemId,
  initialRemixed = false,
  compact = false,
  authenticated = true,
}: {
  kind: "system" | "character";
  itemId: string;
  initialRemixed?: boolean;
  compact?: boolean;
  authenticated?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("Common");
  const [remixed, setRemixed] = useState(initialRemixed);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function remix() {
    if (pending) return;
    if (kind === "system" && remixed) {
      router.push("/dashboard/systems");
      return;
    }
    setPending(true);
    setError(false);
    try {
      if (kind === "system") {
        await apiFetch(`/api/templates/${itemId}/subscription`, { method: "POST" });
        setRemixed(true);
        router.refresh();
      } else {
        const result = await apiFetch<{ id: string }>(
          `/api/characters/${itemId}/remix`,
          { method: "POST" },
        );
        router.push(`/characters/${result.id}`);
      }
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  if (!authenticated) {
    return (
      <Link
        href="/auth/sign-in"
        className={cn(buttonClassName({ variant: "primary", size: "sm" }), compact ? "px-3" : "px-4")}
      >
        <GitFork className="size-4" />
        <span>{t("remix")}</span>
      </Link>
    );
  }

  return (
    <Button
      type="button"
      variant={remixed ? "secondary" : "primary"}
      size="sm"
      onClick={() => void remix()}
      disabled={pending}
      aria-label={error ? t("remixFailed") : t("remix")}
      className={cn("min-w-0", compact ? "px-3" : "px-4", error && "border-red-300 text-red-700")}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : remixed ? (
        <Check className="size-4" />
      ) : (
        <GitFork className="size-4" />
      )}
      <span>{error ? t("retry") : remixed ? t("remixed") : t("remix")}</span>
    </Button>
  );
}
