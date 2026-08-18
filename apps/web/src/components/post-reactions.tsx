"use client";

import { useState } from "react";
import type { PostReaction, PostReactionSummary } from "@mycharacter/contracts";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const reactionMeta: Record<PostReaction, { emoji: string }> = {
  like: { emoji: "♥" },
  fire: { emoji: "🔥" },
  dice: { emoji: "🎲" },
};

export function PostReactions({
  postId,
  initial,
}: {
  postId: string;
  initial: PostReactionSummary[];
}) {
  const t = useTranslations("Posts");
  const [reactions, setReactions] = useState(initial);
  const [pending, setPending] = useState<PostReaction | null>(null);

  async function toggle(reaction: PostReaction) {
    const previous = reactions;
    const current = reactions.find((item) => item.reaction === reaction)!;
    const nextActive = !current.reactedByMe;
    setReactions((items) =>
      items.map((item) =>
        item.reaction === reaction
          ? {
              ...item,
              reactedByMe: nextActive,
              count: item.count + (nextActive ? 1 : -1),
            }
          : item,
      ),
    );
    setPending(reaction);
    try {
      const result = await apiFetch<{ reactions: PostReactionSummary[] }>(
        `/api/posts/${postId}/reactions/${reaction}`,
        { method: nextActive ? "PUT" : "DELETE" },
      );
      setReactions(result.reactions);
    } catch {
      setReactions(previous);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {reactions.map((reaction) => (
        <button
          key={reaction.reaction}
          type="button"
          aria-label={t(`reaction.${reaction.reaction}`)}
          aria-pressed={reaction.reactedByMe}
          disabled={pending === reaction.reaction}
          onClick={() => void toggle(reaction.reaction)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition-colors disabled:opacity-60",
            reaction.reactedByMe
              ? "bg-[var(--brand-soft)] text-[var(--brand)]"
              : "text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--brand)]",
          )}
        >
          <span aria-hidden>{reactionMeta[reaction.reaction].emoji}</span>
          {reaction.count > 0 && <span>{reaction.count}</span>}
        </button>
      ))}
    </div>
  );
}
