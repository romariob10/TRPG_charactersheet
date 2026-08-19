import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PostContent } from "@/components/post-content";
import { PostReactions } from "@/components/post-reactions";
import { AppShell } from "@/components/app-shell";
import { buttonClassName } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { getPublicPost } from "@/lib/community";

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
  const [post, t] = await Promise.all([
    getPublicPost(username, slug),
    getTranslations("Posts"),
  ]);
  if (!post) return { title: "MyCharacter" };
  const title = post.title ?? t("postBy", { username: post.author.username });
  const description = post.blocks
    .flatMap((block) =>
      block.type === "paragraph" || block.type === "header"
        ? [block.data.text]
        : [],
    )
    .join(" ")
    .slice(0, 180);
  return { title, description, openGraph: { title, description } };
}

export default async function PublicPostPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { username, slug } = await params;
  const [post, session, locale, t] = await Promise.all([
    getPublicPost(username, slug),
    getSession(),
    getLocale(),
    getTranslations("Posts"),
  ]);
  if (!post) notFound();
  const published = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(post.publishedAt));

  return (
    <AppShell>
      <main className="page-shell py-5 sm:py-9">
        <article className="mx-auto max-w-3xl overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] shadow-[0_12px_45px_rgba(15,62,23,.05)]">
          <header className="border-b border-[var(--border)] px-5 py-5 sm:px-9 sm:py-7">
            <Link
              href={`/users/${post.author.username}`}
              className="flex items-center gap-3"
            >
              <span className="grid size-11 place-items-center rounded-full bg-[var(--brand)] text-sm font-black text-white">
                {(post.author.displayName ?? post.author.username)
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
              <span>
                <strong className="block">
                  {post.author.displayName ?? `@${post.author.username}`}
                </strong>
                <span className="text-xs text-[var(--muted)]">
                  @{post.author.username}
                </span>
              </span>
            </Link>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <CalendarDays className="size-3.5" /> {published}
            </p>
          </header>
          <div className="px-5 py-6 sm:px-9 sm:py-9">
            <PostContent
              blocks={post.blocks}
              embeds={post.embeds}
              authenticated={Boolean(session)}
            />
          </div>
          <footer className="flex items-center border-t border-[var(--border)] px-4 py-3 sm:px-8">
            {session ? (
              <PostReactions postId={post.id} initial={post.reactions} />
            ) : (
              <Link
                href="/auth/sign-in"
                className={buttonClassName({
                  variant: "secondary",
                  size: "sm",
                })}
              >
                {t("signInToReact")}
              </Link>
            )}
            <Link
              href={
                session ? "/dashboard/feed" : `/users/${post.author.username}`
              }
              className="ml-auto text-sm font-bold text-[var(--brand)] hover:underline"
            >
              ← {t("backToFeed")}
            </Link>
          </footer>
        </article>
      </main>
    </AppShell>
  );
}
