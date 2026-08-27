"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SocialPost } from "@mycharacter/contracts";
import { PostFeed } from "@/components/post-feed";
import type { PostEmbedOptions } from "@/lib/use-post-editor";
import type { MyProfile } from "@/lib/types";

type FeedAuthor = SocialPost["author"];

export function collectFeedAuthors(
  posts: Array<Pick<SocialPost, "author">>,
): FeedAuthor[] {
  return Array.from(
    new Map(posts.map((post) => [post.author.id, post.author])).values(),
  ).slice(0, 5);
}

export function FeedView({
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
  const t = useTranslations("Feed");
  const [currentPosts, setCurrentPosts] = useState(initialPosts);
  const people = useMemo(() => collectFeedAuthors(currentPosts), [currentPosts]);

  return (
    <div
      className={
        people.length > 0
          ? "grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_260px]"
          : "mx-auto max-w-2xl"
      }
    >
      <section className="min-w-0">
        <PostFeed
          initialPosts={initialPosts}
          profile={profile}
          embedOptions={embedOptions}
          locale={locale}
          onPostsChange={setCurrentPosts}
        />
      </section>

      {people.length > 0 && (
        <aside className="hidden space-y-4 lg:sticky lg:top-5 lg:block">
          <section className="rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <UsersRound className="size-4 text-[var(--brand)]" />
              <h2 className="font-bold text-sm">{t("people")}</h2>
            </div>
            <div className="mt-3.5 space-y-2.5">
              {people.map((author) => (
                <Link
                  key={author.id}
                  href={`/users/${author.username}`}
                  className="flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-[var(--keylime)]"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-[var(--brand-soft)] text-xs font-black text-[var(--brand)]">
                    {(author.displayName ?? author.username)
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold">
                      {author.displayName ?? author.username}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--muted)]">
                      @{author.username}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      )}
    </div>
  );
}
