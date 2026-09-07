"use client";

import Link from "next/link";
import { UserRoundCheck, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PublicAuthor, SocialPost } from "@mycharacter/contracts";
import { PostFeed } from "@/components/post-feed";
import type { PostEmbedOptions } from "@/lib/use-post-editor";
import type { MyProfile } from "@/lib/types";

export function FeedView({
  initialPosts,
  profile,
  embedOptions,
  locale,
  popularAuthors,
  followingAuthors,
}: {
  initialPosts: SocialPost[];
  profile: MyProfile;
  embedOptions: PostEmbedOptions;
  locale: string;
  popularAuthors: PublicAuthor[];
  followingAuthors: PublicAuthor[];
}) {
  const t = useTranslations("Feed");

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
      <section className="min-w-0">
        <PostFeed
          initialPosts={initialPosts}
          profile={profile}
          embedOptions={embedOptions}
          locale={locale}
        />
      </section>

      <aside className="hidden space-y-4 lg:sticky lg:top-5 lg:block">
        {popularAuthors.length > 0 && (
          <section className="rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <UsersRound className="size-4 text-[var(--brand)]" />
              <h2 className="font-bold text-sm">{t("popularAuthors")}</h2>
            </div>
            <FeedAuthorList authors={popularAuthors} />
          </section>
        )}

        <section className="rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <UserRoundCheck className="size-4 text-[var(--brand)]" />
            <h2 className="font-bold text-sm">{t("subscriptions")}</h2>
          </div>
          {followingAuthors.length > 0 ? (
            <FeedAuthorList authors={followingAuthors} />
          ) : (
            <p className="mt-3.5 text-xs leading-5 text-[var(--muted)]">
              {t("subscriptionsEmpty")}
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}

function FeedAuthorList({ authors }: { authors: PublicAuthor[] }) {
  return (
    <div className="mt-3.5 space-y-2.5">
      {authors.map((author) => (
        <Link
          key={author.id}
          href={`/users/${author.username}`}
          className="flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-[var(--keylime)]"
        >
          <span className="grid size-8 place-items-center rounded-full bg-[var(--brand-soft)] text-xs font-black text-[var(--brand)]">
            {(author.displayName ?? author.username).slice(0, 1).toUpperCase()}
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
  );
}
