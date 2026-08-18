"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  MessageCircle,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { PostBlock, SocialPost } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import type { MyProfile } from "@/lib/types";
import { cn, formatRelativeDate } from "@/lib/utils";
import {
  PostComposer,
  type PostEmbedOptions,
} from "@/components/post-composer";
import { PostContent } from "@/components/post-content";
import { PostReactions } from "@/components/post-reactions";
import { PostComments } from "@/components/post-comments";

type FeedFilter = "all" | "articles";

export function PostFeed({
  initialPosts,
  profile,
  embedOptions,
  locale,
}: {
  initialPosts: SocialPost[];
  profile: MyProfile;
  embedOptions: PostEmbedOptions;
  locale: string;
}) {
  const t = useTranslations("Posts");
  const [posts, setPosts] = useState(initialPosts);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    const refresh = () => {
      void apiFetch<{ posts: SocialPost[] }>("/api/posts")
        .then((response) => setPosts(response.posts))
        .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 15_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale);
    return posts.filter((post) => {
      if (filter === "articles" && !post.isArticle) return false;
      if (!normalized) return true;
      const text = post.blocks
        .flatMap((block) =>
          block.type === "paragraph" || block.type === "header"
            ? [block.data.text]
            : [],
        )
        .join(" ");
      return [post.title, post.author.username, post.author.displayName, text]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase(locale).includes(normalized));
    });
  }, [filter, locale, posts, query]);

  return (
    <div>
      <PostComposer
        authorName={profile.displayName ?? profile.username}
        options={embedOptions}
        onCreated={(post) => setPosts((current) => [post, ...current])}
      />

      <div className="sticky top-0 z-30 -mx-4 border-b border-[var(--border)] bg-[color:color-mix(in_srgb,var(--background)_92%,transparent)] px-4 py-3 backdrop-blur-xl sm:static sm:mx-0 sm:rounded-[var(--radius-card)] sm:border sm:bg-[var(--surface)] sm:p-2 sm:backdrop-blur-none">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {(["all", "articles"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={cn(
                  "h-9 rounded-full px-3.5 text-sm font-semibold transition-colors",
                  filter === value
                    ? "bg-[var(--brand)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--brand)]",
                )}
              >
                {t(`filter.${value}`)}
              </button>
            ))}
          </div>
          <label className="relative hidden w-52 shrink-0 md:block">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted)]" />
            <span className="sr-only">{t("search")}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              className="h-9 w-full rounded-full border border-[var(--border)] bg-[var(--background)] pr-3 pl-9 text-sm outline-none focus:border-[var(--brand)]"
            />
          </label>
          <button
            type="button"
            onClick={() => setMobileSearchOpen((open) => !open)}
            className="grid size-9 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--keylime)] md:hidden"
            aria-label={t("search")}
            aria-expanded={mobileSearchOpen}
          >
            <SlidersHorizontal className="size-4" />
          </button>
        </div>
        {mobileSearchOpen && (
          <label className="relative mt-2 block md:hidden">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted)]" />
            <span className="sr-only">{t("search")}</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              className="h-10 w-full rounded-full border border-[var(--border)] bg-[var(--background)] pr-3 pl-9 text-sm outline-none focus:border-[var(--brand)]"
            />
          </label>
        )}
      </div>

      {visible.length ? (
        <div className="mt-4 space-y-4 sm:mt-5">
          {visible.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              profile={profile}
              locale={locale}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center">
          <Search className="mx-auto size-7 text-[var(--muted)]" />
          <h2 className="mt-4 text-lg font-bold">{t("emptyFeed")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t("emptyFeedText")}
          </p>
        </div>
      )}
    </div>
  );
}

function PostCard({
  post,
  profile,
  locale,
}: {
  post: SocialPost;
  profile: MyProfile;
  locale: string;
}) {
  const t = useTranslations("Posts");
  const [expanded, setExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const updateCommentCount = useCallback(
    (count: number) => setCommentCount(count),
    [],
  );
  const fullHref = `/users/${post.author.username}/posts/${post.slug}`;
  const shownBlocks =
    post.isArticle || (post.isLong && !expanded)
      ? previewBlocks(
          post.blocks,
          post.isArticle ? 700 : 900,
          post.isArticle ? 4 : 5,
        )
      : post.blocks;
  const initials = (post.author.displayName ?? post.author.username)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="post-card overflow-hidden rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(15,62,23,0.04)]">
      <header className="flex items-center gap-3 px-4 py-4 sm:px-5">
        <Link
          href={`/users/${post.author.username}`}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-xs font-bold text-white ring-4 ring-[var(--keylime)]"
        >
          {initials}
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/users/${post.author.username}`}
            className="block truncate font-bold hover:text-[var(--brand)]"
          >
            {post.author.displayName ?? `@${post.author.username}`}
          </Link>
          <p className="truncate text-xs text-[var(--muted)]">
            @{post.author.username} ·{" "}
            {formatRelativeDate(post.publishedAt, locale)}
          </p>
        </div>
        {post.isArticle && (
          <span className="rounded-full bg-[#e7e0ff] px-2.5 py-1 text-xs font-bold text-[#50358f]">
            {t("article")}
          </span>
        )}
      </header>

      <div className="px-4 pb-4 sm:px-5">
        <PostContent blocks={shownBlocks} embeds={post.embeds} />
        {post.isArticle ? (
          <Link
            href={fullHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--brand)] hover:underline"
          >
            {t("readFull")} <ExternalLink className="size-4" />
          </Link>
        ) : post.isLong && !expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-3 text-sm font-bold text-[var(--brand)] hover:underline"
          >
            {t("more")}
          </button>
        ) : null}
      </div>

      <footer className="flex items-center gap-1 border-t border-[var(--border)] px-3 py-2.5 sm:px-4">
        <PostReactions
          key={post.reactions
            .map((item) => `${item.reaction}:${item.count}:${item.reactedByMe}`)
            .join("|")}
          postId={post.id}
          initial={post.reactions}
        />
        <button
          type="button"
          onClick={() => setCommentsOpen((open) => !open)}
          aria-expanded={commentsOpen}
          aria-label={t("comments.toggle")}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition-colors",
            commentsOpen
              ? "bg-[var(--brand-soft)] text-[var(--brand)]"
              : "text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--brand)]",
          )}
        >
          <MessageCircle className="size-4" />{" "}
          {commentCount > 0 && commentCount}
        </button>
      </footer>
      {commentsOpen && (
        <PostComments
          postId={post.id}
          currentUserId={profile.id}
          currentUserIsAdmin={profile.isAdmin}
          onCountChange={updateCommentCount}
        />
      )}
    </article>
  );
}

function previewBlocks(
  blocks: PostBlock[],
  maxCharacters: number,
  maxBlocks: number,
): PostBlock[] {
  const result: PostBlock[] = [];
  let remaining = maxCharacters;

  for (const block of blocks.slice(0, maxBlocks)) {
    if (remaining <= 0) break;
    if (block.type === "paragraph" || block.type === "header") {
      const text = previewText(block.data.text, remaining);
      result.push({ ...block, data: { ...block.data, text } } as PostBlock);
      remaining -= text.length;
      continue;
    }
    if (block.type === "quote") {
      const text = previewText(block.data.text, remaining);
      result.push({ ...block, data: { ...block.data, text } });
      remaining -= text.length;
      continue;
    }
    if (block.type === "list") {
      const items: string[] = [];
      for (const item of block.data.items) {
        if (remaining <= 0) break;
        const text = previewText(item, remaining);
        items.push(text);
        remaining -= text.length;
      }
      if (items.length)
        result.push({ ...block, data: { ...block.data, items } });
      continue;
    }
    result.push(block);
  }
  return result;
}

function previewText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}
