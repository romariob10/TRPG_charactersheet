import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, FileText, Globe2 } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { RemixButton } from "@/components/remix-button";
import { LikeButton } from "@/components/social-like-button";
import { AppShell } from "@/components/app-shell";
import { TemplateComments } from "@/components/template-comments";
import { TemplateReviews } from "@/components/template-reviews";
import { buttonClassName } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import {
  getCommunityTemplate,
  getTemplateComments,
} from "@/lib/community";
import type { MyProfile } from "@/lib/types";
import type { ListTemplateReviewsResponse } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/server";
import { getMyProfile } from "@/lib/profile";
import { ApiClientError } from "@/lib/api/client";

interface RouteParams {
  username: string;
  slug: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { username, slug } = await params;
  const template = await getCommunityTemplate(username, slug);
  if (!template) {
    return { title: "MyCharacter" };
  }
  const title = `${template.title} · @${template.author?.username ?? username}`;
  const description = template.gameSystem ?? `${template.title} — community template on MyCharacter`;
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { title, description, images: [] },
  };
}

export default async function CommunityTemplatePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { username, slug } = await params;
  const template = await getCommunityTemplate(username, slug);
  if (!template) notFound();

  const [comments, reviewsRes, session, t, tSystems, locale] = await Promise.all([
    getTemplateComments(template.id),
    apiFetch<ListTemplateReviewsResponse>(`/api/templates/${template.id}/reviews`).catch(() => ({
      data: { reviews: [], ratingAverage: 0, ratingCount: 0 },
    })),
    getSession(),
    getTranslations("CommunityPage"),
    getTranslations("Systems"),
    getLocale(),
  ]);

  let myProfile: MyProfile | null = null;
  if (session) {
    try {
      myProfile = await getMyProfile();
    } catch (error) {
      if (!(error instanceof ApiClientError && error.status === 401)) throw error;
    }
  }

  return (
    <AppShell>
      <main className="page-shell py-8">
        <Link
          href={session ? "/dashboard/systems/community" : `/users/${username}`}
          className="text-sm font-semibold text-[var(--brand)] hover:underline"
        >
          ← {t("back")}
        </Link>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <div className="space-y-8">
            <article className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="grid size-11 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]">
                  <FileText className="size-6" />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="size-3.5" />
                  {tSystems("communityReady")}
                </span>
              </div>
              <p className="mt-5 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                {template.gameSystem ?? tSystems("unknownSystem")}
              </p>
              <h1 className="display-heading mt-1 text-3xl text-[var(--brand)] sm:text-4xl">
                {template.title}
              </h1>
              <p className="mt-3 text-sm text-[var(--muted)]">
                {tSystems("pages", { count: template.pageCount })} ·{" "}
                <Globe2 className="inline size-3.5" /> {t("publicTemplate")}
              </p>
            </article>

            <TemplateReviews
              templateId={template.id}
              initialData={reviewsRes.data}
              authenticated={Boolean(session)}
              currentUserId={myProfile?.id ?? null}
              isAdmin={myProfile?.isAdmin ?? false}
              locale={locale}
            />

            <TemplateComments
              templateId={template.id}
              initialItems={comments.items}
              initialNextCursor={comments.nextCursor}
              initialTotalCount={template.commentCount ?? comments.items.length}
              authenticated={Boolean(session)}
              currentUsername={myProfile?.username ?? null}
              isAdmin={myProfile?.isAdmin ?? false}
              locale={locale}
            />
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                {t("authorEyebrow")}
              </p>
              <Link
                href={`/users/${template.author?.username ?? username}`}
                className="mt-2 block text-lg font-bold text-[var(--brand)] hover:underline"
              >
                @{template.author?.username ?? username}
              </Link>
              {template.author?.displayName && (
                <p className="text-sm text-[var(--muted)]">
                  {template.author.displayName}
                </p>
              )}
            </div>

            <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center gap-1">
                <LikeButton
                  templateId={template.id}
                  initialLiked={Boolean(template.likedByMe)}
                  initialCount={template.likeCount ?? 0}
                  authenticated={Boolean(session)}
                  likeLabel={t("likeAria", { name: template.title })}
                  unlikeLabel={t("unlikeAria", { name: template.title })}
                  signInLabel={t("likeSignIn")}
                />
                <span className="inline-flex h-9 items-center gap-1.5 px-2.5 text-sm font-semibold text-[var(--muted)]">
                  {t("commentsCount", {
                    count: template.commentCount ?? comments.items.length,
                  })}
                </span>
              </div>
              <div className="mt-4 border-t pt-4">
                {session && template.author?.id !== myProfile?.id ? (
                  <RemixButton
                    kind="system"
                    itemId={template.id}
                    initialRemixed={Boolean(template.subscribed)}
                  />
                ) : !session ? (
                  <Link
                    href="/auth/sign-in"
                    className={buttonClassName({ variant: "primary", size: "md" }) + " w-full"}
                  >
                    {tSystems("remix")}
                  </Link>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
