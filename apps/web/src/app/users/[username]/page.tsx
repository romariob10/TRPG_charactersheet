import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, FileText, Heart } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth";
import { getPublicProfile } from "@/lib/community";

interface RouteParams {
  username: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { username } = await params;
  const result = await getPublicProfile(username);
  if (!result) {
    return { title: "MyCharacter" };
  }
  return {
    title: `@${result.profile.username}${
      result.profile.displayName ? ` · ${result.profile.displayName}` : ""
    }`,
    description: result.profile.bio || undefined,
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { username } = await params;
  const result = await getPublicProfile(username);
  if (!result) notFound();
  const { profile, templates } = result;

  const [session, t, locale] = await Promise.all([
    getSession(),
    getTranslations("UsersPage"),
    getLocale(),
  ]);
  const joinedFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <SiteHeader authenticated={Boolean(session)} />
      <main className="page-shell py-8">
        <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="display-heading mt-1 text-3xl text-[var(--brand)] sm:text-4xl">
            @{profile.username}
          </h1>
          {profile.displayName && (
            <p className="mt-1 text-lg font-semibold">{profile.displayName}</p>
          )}
          {profile.bio && (
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
              {profile.bio}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" />
              {t("joinedAt", { date: joinedFormatter.format(new Date(profile.joinedAt)) })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-4" />
              {t("templatesCount", { count: profile.publicTemplateCount })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Heart className="size-4" />
              {t("totalLikes", { count: profile.totalLikes })}
            </span>
          </div>
        </section>

        <h2 className="mt-10 text-2xl font-bold">{t("templatesTitle")}</h2>
        {templates.length ? (
          <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <article
                key={template.id}
                className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--brand)]/35"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="grid size-11 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]">
                    <FileText className="size-6" />
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--keylime)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
                    <Heart className="size-3.5" />
                    {template.likeCount ?? 0}
                  </span>
                </div>
                <p className="mt-5 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                  {template.gameSystem ?? t("unknownSystem")}
                </p>
                <h3 className="mt-1 truncate text-xl font-bold">
                  <Link
                    href={`/community/${profile.username}/${template.slug ?? template.id}`}
                    className="hover:text-[var(--brand)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
                  >
                    {template.title}
                  </Link>
                </h3>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  {t("pages", { count: template.pageCount })}
                </p>
              </article>
            ))}
          </section>
        ) : (
          <div className="mt-5 rounded-[var(--radius-card)] border border-dashed bg-[var(--keylime)] px-6 py-10 text-center">
            <FileText className="mx-auto size-8 text-[var(--brand)]" />
            <h3 className="mt-5 text-xl font-bold">{t("emptyTemplates")}</h3>
            <p className="mx-auto mt-2 max-w-lg text-[var(--muted)]">
              {t("emptyTemplatesText")}
            </p>
          </div>
        )}
      </main>
    </>
  );
}
