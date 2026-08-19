"use client";

import { useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ListTemplateReviewsResponse, TemplateReview } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import { formatRelativeDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function TemplateReviews({
  templateId,
  initialData,
  authenticated,
  currentUserId,
  isAdmin,
  locale,
}: {
  templateId: string;
  initialData: ListTemplateReviewsResponse;
  authenticated: boolean;
  currentUserId: string | null;
  isAdmin: boolean;
  locale: string;
}) {
  const t = useTranslations("TemplateReviews");
  const [data, setData] = useState<ListTemplateReviewsResponse>(initialData);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await apiFetch<TemplateReview>(
        '/api/templates/' + templateId + '/reviews',
        {
          method: "POST",
          body: JSON.stringify({ rating, title: title.trim() || undefined, body: body.trim() || undefined }),
        },
      );
      setData((prev) => {
        const existingIdx = prev.reviews.findIndex((r) => r.userId === currentUserId);
        const updated = existingIdx >= 0
          ? prev.reviews.map((r, i) => (i === existingIdx ? created : r))
          : [created, ...prev.reviews];
        const newCount = existingIdx >= 0 ? prev.ratingCount : prev.ratingCount + 1;
        const newAvg = updated.reduce((sum, r) => sum + r.rating, 0) / (updated.length || 1);
        return {
          reviews: updated,
          ratingCount: newCount,
          ratingAverage: Math.round(newAvg * 10) / 10,
        };
      });
      setShowForm(false);
      setTitle("");
      setBody("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(reviewId: string) {
    try {
      await apiFetch('/api/templates/' + templateId + '/reviews/' + reviewId, {
        method: "DELETE",
      });
      setData((prev) => {
        const filtered = prev.reviews.filter((r) => r.id !== reviewId);
        const newAvg = filtered.length
          ? filtered.reduce((sum, r) => sum + r.rating, 0) / filtered.length
          : 0;
        return {
          reviews: filtered,
          ratingCount: Math.max(prev.ratingCount - 1, 0),
          ratingAverage: Math.round(newAvg * 10) / 10,
        };
      });
    } catch {}
  }

  return (
    <section className="space-y-6 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-[var(--foreground)]">
              {t("title")}
            </h2>
            <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">
              <Star className="size-3.5 fill-amber-400 text-amber-500" />
              <span>{data.ratingAverage.toFixed(1)}</span>
              <span className="text-[var(--muted)]">({data.ratingCount})</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("subtitle")}</p>
        </div>

        {authenticated && !showForm && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Star className="size-4 text-amber-500" />
            <span>{t("rateSystem")}</span>
          </Button>
        )}
      </div>

      {/* Review Form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--keylime)]/30 p-4"
        >
          <div>
            <span className="text-xs font-bold text-[var(--foreground)]">
              {t("yourRating")}
            </span>
            <div className="mt-1 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = (hoverRating ?? rating) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(null)}
                    onClick={() => setRating(star)}
                    className="p-1 transition-transform hover:scale-110 focus:outline-none"
                  >
                    <Star
                      className={
                        "size-6 " +
                        (active
                          ? "fill-amber-400 text-amber-500"
                          : "text-zinc-300")
                      }
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder={t("reviewTitle")}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
          />

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={t("reviewBody")}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
          />

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? t("submitting") : t("submit")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Reviews List */}
      {data.reviews.length === 0 ? (
        <p className="py-6 text-center text-xs text-[var(--muted)]">
          {t("noReviews")}
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {data.reviews.map((rev) => {
            const canDelete =
              rev.userId === currentUserId || isAdmin;
            return (
              <div key={rev.id} className="py-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--foreground)]">
                      {rev.authorDisplayName || "@" + rev.authorUsername}
                    </span>
                    <div className="flex items-center">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={
                            "size-3.5 " +
                            (rev.rating >= s
                              ? "fill-amber-400 text-amber-500"
                              : "text-zinc-300")
                          }
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--muted)]">
                      {formatRelativeDate(rev.createdAt, locale)}
                    </span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(rev.id)}
                        className="text-[var(--muted)] hover:text-red-600 p-1"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {rev.title && (
                  <h3 className="text-sm font-bold text-[var(--foreground)]">
                    {rev.title}
                  </h3>
                )}

                {rev.body && (
                  <p className="text-xs text-[var(--muted)] leading-relaxed whitespace-pre-wrap">
                    {rev.body}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
