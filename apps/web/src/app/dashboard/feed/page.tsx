import { redirect } from "next/navigation";
import { Compass } from "lucide-react";
import type { SocialPost } from "@mycharacter/contracts";
import { getLocale, getTranslations } from "next-intl/server";
import { FeedView } from "@/components/feed-view";
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

        <FeedView
          initialPosts={feed.data.posts}
          profile={profile.data}
          embedOptions={embedOptions.data}
          locale={locale}
        />
      </div>
    </main>
  );
}
