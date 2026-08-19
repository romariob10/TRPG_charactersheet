"use client";

import { useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import type { PostReaction, PostReactionSummary } from "@mycharacter/contracts";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const reactionMeta: Record<PostReaction, { emoji: string; labelKey: string }> = {
  like: { emoji: "❤️", labelKey: "reaction.like" },
  joy: { emoji: "😄", labelKey: "reaction.joy" },
  moai: { emoji: "🗿", labelKey: "reaction.moai" },
  fire: { emoji: "🔥", labelKey: "reaction.fire" },
  mindblown: { emoji: "🤯", labelKey: "reaction.mindblown" },
  dice: { emoji: "🎲", labelKey: "reaction.dice" },
};

const ALL_REACTIONS: PostReaction[] = [
  "like",
  "joy",
  "moai",
  "fire",
  "mindblown",
  "dice",
];

export function PostReactions({
  postId,
  initial,
}: {
  postId: string;
  initial: PostReactionSummary[];
}) {
  const t = useTranslations("Posts");
  const [reactions, setReactions] = useState(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<PostReaction | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  async function toggle(reaction: PostReaction) {
    const previous = reactions;
    const current = reactions.find((item) => item.reaction === reaction) ?? {
      reaction,
      count: 0,
      reactedByMe: false,
    };
    const nextActive = !current.reactedByMe;

    setReactions((items) => {
      const exists = items.some((item) => item.reaction === reaction);
      const updated = items.map((item) => {
        if (item.reaction === reaction) {
          return {
            ...item,
            reactedByMe: nextActive,
            count: Math.max(0, item.count + (nextActive ? 1 : -1)),
          };
        }
        // If turning on a new reaction, turn off any previous reaction
        if (nextActive && item.reactedByMe) {
          return {
            ...item,
            reactedByMe: false,
            count: Math.max(0, item.count - 1),
          };
        }
        return item;
      });
      if (!exists && nextActive) {
        return [...updated, { reaction, count: 1, reactedByMe: true }];
      }
      return updated;
    });

    setPending(reaction);
    setPickerOpen(false);

    try {
      const result = await apiFetch<{ reactions: PostReactionSummary[] }>(
        `/api/posts/${postId}/reactions/${reaction}`,
        { method: nextActive ? "PUT" : "DELETE" }
      );
      setReactions(result.reactions);
    } catch {
      setReactions(previous);
    } finally {
      setPending(null);
    }
  }

  const activeReactions = reactions.filter((r) => r.count > 0 || r.reactedByMe);

  return (
    <div className="relative inline-flex flex-wrap items-center gap-1.5">
      {/* Existing active reactions */}
      {activeReactions.map((item) => (
        <button
          key={item.reaction}
          type="button"
          aria-label={t(reactionMeta[item.reaction].labelKey)}
          aria-pressed={item.reactedByMe}
          disabled={pending === item.reaction}
          onClick={() => void toggle(item.reaction)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold transition-all disabled:opacity-60",
            item.reactedByMe
              ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] shadow-xs"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--keylime)]"
          )}
        >
          <span className="text-sm leading-none" aria-hidden>
            {reactionMeta[item.reaction].emoji}
          </span>
          <span className="text-xs font-bold">{item.count}</span>
        </button>
      ))}

      {/* Add reaction trigger */}
      <div className="relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setPickerOpen((prev) => !prev)}
          className={cn(
            "grid size-8 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--brand)]",
            pickerOpen && "bg-[var(--keylime)] text-[var(--brand)]"
          )}
          aria-label={t("addReaction")}
          title={t("addReaction")}
        >
          <SmilePlus className="size-4" />
        </button>

        {/* Floating reaction picker popover */}
        {pickerOpen && (
          <div className="absolute bottom-full left-0 z-50 mb-2 flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.14)] animate-in fade-in zoom-in-95 duration-100">
            {ALL_REACTIONS.map((reaction) => {
              const current = reactions.find((r) => r.reaction === reaction);
              const isSelected = current?.reactedByMe;
              return (
                <button
                  key={reaction}
                  type="button"
                  onClick={() => void toggle(reaction)}
                  aria-label={t(reactionMeta[reaction].labelKey)}
                  className={cn(
                    "grid size-9 place-items-center rounded-full text-lg transition-transform hover:scale-125 active:scale-95",
                    isSelected ? "bg-[var(--brand-soft)]" : "hover:bg-[var(--keylime)]"
                  )}
                >
                  <span aria-hidden>{reactionMeta[reaction].emoji}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
