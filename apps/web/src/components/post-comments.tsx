"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Send, Trash2 } from "lucide-react";
import type { PostComment } from "@mycharacter/contracts";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PostComments({
  postId,
  currentUserId,
  currentUserIsAdmin,
  onCountChange,
}: {
  postId: string;
  currentUserId: string;
  currentUserIsAdmin: boolean;
  onCountChange: (count: number) => void;
}) {
  const t = useTranslations("Posts");
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiFetch<{ comments: PostComment[] }>(`/api/posts/${postId}/comments`)
      .then((response) => {
        if (!active) return;
        setComments(response.comments);
        onCountChange(response.comments.length);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : t("comments.loadFailed"),
          );
      });
    return () => {
      active = false;
    };
  }, [onCountChange, postId, t]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const comment = await apiFetch<PostComment>(
        `/api/posts/${postId}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        },
      );
      const next = [...(comments ?? []), comment];
      setComments(next);
      onCountChange(next.length);
      setBody("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("comments.sendFailed"),
      );
    } finally {
      setSending(false);
    }
  }

  async function remove(commentId: string) {
    try {
      await apiFetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
      });
      const next = (comments ?? []).filter((item) => item.id !== commentId);
      setComments(next);
      onCountChange(next.length);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("comments.deleteFailed"),
      );
    }
  }

  return (
    <section className="border-t border-[var(--border)] bg-[var(--surface-strong)] px-4 py-4 sm:px-5">
      {comments === null && !error ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <LoaderCircle className="size-4 animate-spin" />{" "}
          {t("comments.loading")}
        </div>
      ) : (
        <div className="space-y-3">
          {comments?.length === 0 && (
            <p className="text-sm text-[var(--muted)]">{t("comments.empty")}</p>
          )}
          {comments?.map((comment) => (
            <article key={comment.id} className="flex gap-3">
              <Link
                href={`/users/${comment.author.username}`}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[11px] font-black text-white"
              >
                {(comment.author.displayName ?? comment.author.username)
                  .slice(0, 1)
                  .toUpperCase()}
              </Link>
              <div className="min-w-0 flex-1 rounded-xl bg-[var(--surface)] px-3 py-2">
                <div className="flex items-start gap-2">
                  <Link
                    href={`/users/${comment.author.username}`}
                    className="truncate text-xs font-bold hover:text-[var(--brand)]"
                  >
                    {comment.author.displayName ??
                      `@${comment.author.username}`}
                  </Link>
                  {(comment.author.id === currentUserId ||
                    currentUserIsAdmin) && (
                    <button
                      type="button"
                      onClick={() => void remove(comment.id)}
                      className="ml-auto text-[var(--muted)] hover:text-red-600"
                      aria-label={t("comments.delete")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-5">
                  {comment.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-4 flex gap-2"
      >
        <Input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          placeholder={t("comments.placeholder")}
          aria-label={t("comments.placeholder")}
          className="h-10"
        />
        <Button
          type="submit"
          size="icon"
          disabled={sending || !body.trim()}
          aria-label={t("comments.send")}
        >
          {sending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
    </section>
  );
}
