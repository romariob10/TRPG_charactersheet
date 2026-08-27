"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  Check,
  ExternalLink,
  Eye,
  Flag,
  MessageCircle,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Trash2,
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

type FeedFilter = "all" | "articles" | "saved";

export function PostFeed({
  initialPosts,
  profile,
  embedOptions,
  locale,
  onPostsChange,
}: {
  initialPosts: SocialPost[];
  profile: MyProfile;
  embedOptions: PostEmbedOptions;
  locale: string;
  onPostsChange?: (posts: SocialPost[]) => void;
}) {
  const t = useTranslations("Posts");
  const [posts, setPosts] = useState(initialPosts);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const fetchFeed = useCallback((currentFilter: FeedFilter) => {
    const endpoint = currentFilter === "saved" ? "/api/posts/saved" : "/api/posts";
    void apiFetch<{ posts: SocialPost[] }>(endpoint)
      .then((response) => setPosts(response.posts))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchFeed(filter);
    const timer = window.setInterval(() => fetchFeed(filter), 15_000);
    const onFocus = () => fetchFeed(filter);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchFeed, filter]);

  useEffect(() => {
    onPostsChange?.(posts);
  }, [onPostsChange, posts]);

  const handleDeletePost = useCallback((postId: string) => {
    setPosts((current) => current.filter((p) => p.id !== postId));
  }, []);

  const handleUpdatePost = useCallback((updatedPost: SocialPost) => {
    setPosts((current) =>
      current.map((p) => (p.id === updatedPost.id ? updatedPost : p))
    );
  }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale);
    return posts.filter((post) => {
      if (filter === "articles" && !post.isArticle) return false;
      if (filter === "saved" && !post.isSaved) return false;
      if (!normalized) return true;
      const text = post.blocks
        .flatMap((block) =>
          block.type === "paragraph" || block.type === "header"
            ? [block.data.text]
            : []
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
        userId={profile.id}
        options={embedOptions}
        onCreated={(post) => setPosts((current) => [post, ...current])}
      />

      <div className="sticky top-0 z-30 -mx-4 border-b border-[var(--border)] bg-[color:color-mix(in_srgb,var(--background)_92%,transparent)] px-4 py-3 backdrop-blur-xl sm:static sm:mx-0 sm:rounded-[var(--radius-card)] sm:border sm:bg-[var(--surface)] sm:p-2 sm:backdrop-blur-none">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {(["all", "articles", "saved"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={cn(
                  "h-9 rounded-full px-3.5 text-sm font-semibold transition-colors",
                  filter === value
                    ? "bg-[var(--brand)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--keylime)] hover:text-[var(--brand)]"
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
              onDelete={handleDeletePost}
              onUpdate={handleUpdatePost}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center">
          <Search className="mx-auto size-7 text-[var(--muted)]" />
          <h2 className="mt-4 text-lg font-bold">
            {filter === "saved" ? t("emptySaved") : t("emptyFeed")}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {filter === "saved" ? t("emptySavedText") : t("emptyFeedText")}
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
  onDelete,
  onUpdate,
}: {
  post: SocialPost;
  profile: MyProfile;
  locale: string;
  onDelete: (postId: string) => void;
  onUpdate: (post: SocialPost) => void;
}) {
  const t = useTranslations("Posts");
  const cardRef = useRef<HTMLElement>(null);
  const viewSentRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [viewsCount, setViewsCount] = useState(post.viewsCount ?? 0);
  const [isSaved, setIsSaved] = useState(Boolean(post.isSaved));
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reported, setReported] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAuthor = post.author.id === profile.id;
  const fullHref = `/users/${post.author.username}/posts/${post.slug}`;

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // Track post view via IntersectionObserver once
  useEffect(() => {
    if (viewSentRef.current) return;
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !viewSentRef.current) {
          viewSentRef.current = true;
          void apiFetch<{ viewsCount: number }>(`/api/posts/${post.id}/view`, {
            method: "POST",
          })
            .then((res) => {
              if (typeof res.viewsCount === "number") {
                setViewsCount(res.viewsCount);
              }
            })
            .catch(() => undefined);
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [post.id]);

  const updateCommentCount = useCallback(
    (count: number) => setCommentCount(count),
    []
  );

  const handleToggleSave = async () => {
    const next = !isSaved;
    setIsSaved(next);
    onUpdate({ ...post, isSaved: next });
    try {
      await apiFetch<{ isSaved: boolean }>(`/api/posts/${post.id}/save`, {
        method: next ? "PUT" : "DELETE",
      });
    } catch {
      setIsSaved(!next);
      onUpdate({ ...post, isSaved: !next });
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/users/${post.author.username}/posts/${post.slug}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setMenuOpen(false);
  };

  const handleReport = async () => {
    try {
      await apiFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          targetType: "post",
          targetId: post.id,
          reason: "User reported post via feed menu",
        }),
      });
      setReported(true);
      setTimeout(() => setReported(false), 4000);
    } catch {
      setReported(true);
      setTimeout(() => setReported(false), 4000);
    } finally {
      setMenuOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/posts/${post.id}`, { method: "DELETE" });
      onDelete(post.id);
    } catch {
      setDeleteError(t("deleteFailed"));
      setDeleting(false);
    }
  };

  const shownBlocks =
    post.isArticle || (post.isLong && !expanded)
      ? previewBlocks(
          post.blocks,
          post.isArticle ? 700 : 900,
          post.isArticle ? 4 : 5
        )
      : post.blocks;

  const initials = (post.author.displayName ?? post.author.username)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article
      ref={cardRef}
      className="post-card relative rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(15,62,23,0.04)]"
    >
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

        {/* 3 dots menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="grid size-8 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--foreground)]"
            aria-label={t("actions")}
            title={t("actions")}
          >
            <MoreHorizontal className="size-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.12)]">
              {isAuthor ? (
                <>
                  <Link
                    href={`/users/${post.author.username}/posts/${post.slug}`}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--keylime)]"
                    onClick={() => setMenuOpen(false)}
                  >
                    <ExternalLink className="size-3.5 text-[var(--muted)]" />
                    <span>{t("readFull")}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" />
                    <span>{t("delete")}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleReport}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--keylime)]"
                  >
                    <Flag className="size-3.5 text-[var(--muted)]" />
                    <span>{t("report")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--keylime)]"
                  >
                    <ExternalLink className="size-3.5 text-[var(--muted)]" />
                    <span>{copied ? t("copied") : t("share")}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {reported && (
        <div className="mx-4 mb-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 sm:mx-5">
          <strong className="block font-bold">{t("reported")}</strong>
          <span>{t("reportHint")}</span>
        </div>
      )}

      {deleteError && (
        <div className="mx-4 mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-700 sm:mx-5">
          {deleteError}
        </div>
      )}

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

      <footer className="border-t border-[var(--border)] px-4 py-3 sm:px-5">
        {/* Reactions row */}
        <div className="mb-2.5">
          <PostReactions
            key={post.reactions
              .map((item) => `${item.reaction}:${item.count}:${item.reactedByMe}`)
              .join("|")}
            postId={post.id}
            initial={post.reactions}
          />
        </div>

        {/* Action bar matching modern design */}
        <div className="flex items-center justify-between text-[var(--muted)]">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setCommentsOpen((open) => !open)}
              aria-expanded={commentsOpen}
              aria-label={t("comments.toggle")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors hover:text-[var(--brand)]",
                commentsOpen
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "hover:bg-[var(--keylime)]"
              )}
            >
              <MessageCircle className="size-4" />
              <span>{commentCount > 0 ? commentCount : 0}</span>
            </button>

            {/* Bookmark / Save button */}
            <button
              type="button"
              onClick={() => void handleToggleSave()}
              aria-label={isSaved ? t("saved") : t("save")}
              title={isSaved ? t("saved") : t("save")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                isSaved
                  ? "bg-[var(--brand-soft)] text-[var(--brand)] font-bold shadow-xs"
                  : "hover:bg-[var(--keylime)] hover:text-[var(--brand)] text-[var(--muted)]"
              )}
            >
              <Bookmark className={cn("size-4", isSaved && "fill-current")} />
              {isSaved && <span>{t("saved")}</span>}
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <Eye className="size-3.5" />
            <span>{viewsCount}</span>
          </div>
        </div>
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
  maxBlocks: number
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
