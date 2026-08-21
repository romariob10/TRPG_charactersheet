"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import type { TemplateComment } from "@/lib/types";

export function TemplateComments({
  templateId,
  initialItems,
  initialNextCursor,
  initialTotalCount,
  authenticated,
  currentUsername,
  isAdmin,
  locale,
}: {
  templateId: string;
  initialItems: TemplateComment[];
  initialNextCursor: string | null;
  initialTotalCount: number;
  authenticated: boolean;
  currentUsername: string | null;
  isAdmin: boolean;
  locale: string;
}) {
  const t = useTranslations("CommunityPage");
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [loadingMore, setLoadingMore] = useState(false);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiFetch<TemplateComment>(
        `/api/templates/${templateId}/comments`,
        { method: "POST", body: JSON.stringify({ body: trimmed }) },
      );
      setItems((current) => [created, ...current]);
      setTotalCount((current) => current + 1);
      setBody("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("commentSubmitFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await apiFetch<{
        items: TemplateComment[];
        nextCursor: string | null;
      }>(
        `/api/templates/${templateId}/comments?limit=20&cursor=${encodeURIComponent(nextCursor)}`,
      );
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("commentsLoadFailed"),
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(commentId: string) {
    setPendingDeleteId(commentId);
    setError(null);
    try {
      await apiFetch(`/api/templates/${templateId}/comments/${commentId}`, {
        method: "DELETE",
      });
      setItems((current) => current.filter((item) => item.id !== commentId));
      setTotalCount((current) => Math.max(0, current - 1));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("commentDeleteFailed"),
      );
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <section aria-label={t("commentsTitle")} className="space-y-5">
      <h2 className="text-xl font-bold">
        {t("commentsTitle")}{" "}
        <span className="font-semibold text-[var(--muted)]">({totalCount})</span>
      </h2>

      {authenticated ? (
        <form onSubmit={(event) => void submit(event)} className="space-y-3">
          <label className="block text-sm font-semibold">
            <span className="sr-only">{t("commentFormLabel")}</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={t("commentPlaceholder")}
              className="w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
            />
          </label>
          <Button type="submit" disabled={submitting || !body.trim()}>
            <MessageCircle className="size-4" />
            {submitting ? t("commentSubmitting") : t("commentSubmit")}
          </Button>
        </form>
      ) : (
        <p className="rounded-[var(--radius-control)] bg-[var(--keylime)] p-4 text-sm">
          <Link
            href="/auth/sign-in"
            className="font-semibold text-[var(--brand)] underline"
          >
            {t("commentSignIn")}
          </Link>{" "}
          {t("commentSignInText")}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {items.length ? (
        <ul className="space-y-4">
          {items.map((comment) => {
            const canDelete =
              authenticated &&
              (isAdmin || comment.author.username === currentUsername);
            return (
              <li
                key={comment.id}
                className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">
                    <Link
                      href={`/users/${comment.author.username}`}
                      className="font-semibold text-[var(--brand)] hover:underline"
                    >
                      @{comment.author.username}
                    </Link>
                    {comment.author.displayName
                      ? ` · ${comment.author.displayName}`
                      : ""}
                    <span className="ml-2 text-xs text-[var(--muted)]">
                      {dateFormatter.format(new Date(comment.createdAt))}
                    </span>
                  </p>
                  {canDelete && (
                    <button
                      type="button"
                      aria-label={t("commentDeleteAria")}
                      disabled={pendingDeleteId === comment.id}
                      onClick={() => void remove(comment.id)}
                      className="inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-[var(--muted)] transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{comment.body}</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-[var(--muted)]">{t("commentsEmpty")}</p>
      )}

      {nextCursor && (
        <Button
          type="button"
          variant="secondary"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? t("commentsLoadingMore") : t("commentsLoadMore")}
        </Button>
      )}
    </section>
  );
}
