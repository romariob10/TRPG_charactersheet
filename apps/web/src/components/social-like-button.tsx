"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export function LikeButton({
  templateId,
  characterId,
  initialLiked,
  initialCount,
  authenticated,
  likeLabel,
  unlikeLabel,
  signInLabel,
  className,
}: {
  templateId?: string;
  characterId?: string;
  initialLiked: boolean;
  initialCount: number;
  authenticated: boolean;
  likeLabel: string;
  unlikeLabel: string;
  signInLabel: string;
  className?: string;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [serverState, setServerState] = useState({ initialLiked, initialCount });

  if (
    serverState.initialLiked !== initialLiked ||
    serverState.initialCount !== initialCount
  ) {
    setServerState({ initialLiked, initialCount });
    setLiked(initialLiked);
    setCount(initialCount);
  }

  if (!authenticated) {
    return (
      <Link
        href="/auth/sign-in"
        title={signInLabel}
        aria-label={likeLabel}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-sm font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--keylime)]/70 hover:text-[var(--brand)]",
          className,
        )}
      >
        <Heart className="size-4" />
        <span>{count}</span>
      </Link>
    );
  }

  async function toggle() {
    const next = !liked;
    setLiked(next);
    setCount((current) => current + (next ? 1 : -1));
    setPending(true);
    try {
      const endpoint = characterId
        ? `/api/characters/${characterId}/like`
        : `/api/templates/${templateId}/like`;
      await apiFetch(endpoint, {
        method: next ? "PUT" : "DELETE",
      });
    } catch {
      setLiked(!next);
      setCount((current) => current + (next ? -1 : 1));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={liked ? unlikeLabel : likeLabel}
      disabled={pending}
      onClick={() => void toggle()}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-sm font-semibold transition-colors disabled:opacity-60",
        liked
          ? "text-[var(--brand)]"
          : "text-[var(--muted)] hover:bg-[var(--keylime)]/70 hover:text-[var(--brand)]",
        className,
      )}
    >
      <Heart className={cn("size-4", liked && "fill-current")} />
      <span>{count}</span>
    </button>
  );
}
