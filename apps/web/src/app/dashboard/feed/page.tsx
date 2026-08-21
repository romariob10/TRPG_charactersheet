import Link from "next/link";
import { redirect } from "next/navigation";
import { Compass, UsersRound } from "lucide-react";
import type { SocialPost } from "@mycharacter/contracts";
import { getLocale, getTranslations } from "next-intl/server";
import { PostFeed } from "@/components/post-feed";
import type { PostEmbedOptions } from "@/lib/use-post-editor";
import { apiFetch } from "@/lib/api/server";
import { getSession } from "@/lib/auth";
import type { MyProfile } from "@/lib/types";

export default async function FeedPage() {
  const session = await getSession();
  if (!session) {
    redirect("/auth/sign-in");
  }

  const [feed, profile, embedOptions, t, locale] = await Promise.all([
    apiFetch<{ posts: SocialPost[] }>("/api/posts"),
    apiFetch<MyProfile>("/api/profiles/me"),
    apiFetch<PostEmbedOptions>("/api/posts/embed-options"),
    getTranslations("Feed"),
    getLocale(),
  ]);

  const people = Array.from(
    new Map(
      feed.data.posts.map((post) => [post.author.username, post.author]),
    ).values(),
  )
    .filter((author) => author.id !== profile.data.id)
    .slice(0, 5);

  return (
    <main className="page-shell py-5 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-center sm:mb-8">
          <div className="inline-flex items-center gap-2 text-xs font-bold tracking-[.13em] text-[var(--brand)] uppercase">
            <Compass className="size-4" /> {t("eyebrow")}
          </div>
          <h1 className="display-heading mt-1 text-3xl text-[var(--brand)] sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-1.5 mx-auto max-w-lg text-sm text-[var(--muted)] sm:text-base">
            {t("subtitle")}
          </p>
        </div>

        <div className={people.length > 0 ? "grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_260px]" : "mx-auto max-w-2xl"}>
          <section className="min-w-0">
            <PostFeed
              initialPosts={feed.data.posts}
              profile={profile.data}
              embedOptions={embedOptions.data}
              locale={locale}
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
      </div>
    </main>
  );
}
