"use client";

import { useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";

export function CharacterVisibilityButton({
  characterId,
  initialPublic,
}: {
  characterId: string;
  initialPublic: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("Dashboard");
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !isPublic;
    setPending(true);
    try {
      await apiFetch(`/api/characters/${characterId}`, {
        method: "PATCH",
        body: JSON.stringify({ isPublic: next }),
      });
      setIsPublic(next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending}
      className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-sm hover:bg-[var(--keylime)] disabled:opacity-60"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : isPublic ? (
        <EyeOff className="size-4" />
      ) : (
        <Eye className="size-4" />
      )}
      {isPublic ? t("hideFromFeed") : t("publishToFeed")}
    </button>
  );
}
