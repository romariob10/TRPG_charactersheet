import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarDays, FileUser, Heart, Pencil, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FollowButton } from "@/components/follow-button";
import { LikeButton } from "@/components/social-like-button";
import { RemixButton } from "@/components/remix-button";
import { SendMessageButton } from "@/components/send-message-button";
import { AppShell } from "@/components/app-shell";
import { buttonClassName } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { getPublicProfile } from "@/lib/community";

interface RouteParams { username: string }

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { username } = await params;
  const result = await getPublicProfile(username);
  if (!result) return { title: "MyCharacter" };
  const title = `${result.profile.displayName ?? `@${result.profile.username}`} — MyCharacter`;
  const description = result.profile.bio || `Профиль @${result.profile.username} в сообществе MyCharacter`;
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { title, description, images: [] },
  };
}

export default async function PublicProfilePage({ params }: { params: Promise<RouteParams> }) {
  const { username } = await params;
  const [result, session, locale, t] = await Promise.all([
    getPublicProfile(username), getSession(), getLocale(), getTranslations("UsersPage"),
  ]);
  if (!result) notFound();
  const { profile, templates, characters } = result;
  const ownProfile = session?.user.id === profile.id;
  const initials = (profile.displayName ?? profile.username).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const joined = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(profile.joinedAt));

  return (
    <AppShell>
      <main className="page-shell py-5 sm:py-8">
        <section className="overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)]">
          <div className="h-28 bg-[linear-gradient(120deg,var(--brand)_0%,#245e32_55%,var(--sage)_180%)] sm:h-40">
            <div className="h-full w-full opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_0_2px,transparent_2px),radial-gradient(circle_at_80%_60%,white_0_1px,transparent_1px)] [background-size:34px_34px,26px_26px]" />
          </div>
          <div className="px-4 pb-6 sm:px-8 sm:pb-8">
            <div className="flex items-end justify-between gap-4">
              <div className="-mt-12 grid size-24 place-items-center rounded-full border-4 border-[var(--surface)] bg-[var(--brand-soft)] text-2xl font-black text-[var(--brand)] shadow-sm sm:-mt-14 sm:size-28 sm:text-3xl">{initials}</div>
              <div className="pt-3">
                {ownProfile ? (
                  <Link href="/dashboard/profile" className={buttonClassName({ variant: "secondary", size: "sm" })}><Pencil className="size-4" /> {t("edit")}</Link>
                ) : session ? (
                  <div className="flex items-center gap-2">
                    <SendMessageButton recipientUsername={profile.username} />
                    <FollowButton username={profile.username} initialFollowing={profile.followedByMe} />
                  </div>
                ) : (
                  <Link href="/auth/sign-in" className={buttonClassName({ size: "sm" })}>{t("follow")}</Link>
                )}
              </div>
            </div>
            <h1 className="display-heading mt-4 text-3xl text-[var(--brand)] sm:text-4xl">{profile.displayName ?? `@${profile.username}`}</h1>
            <p className="mt-0.5 font-semibold text-[var(--muted)]">@{profile.username}</p>
            {profile.bio && <p className="mt-4 max-w-2xl text-[15px] leading-7">{profile.bio}</p>}
            <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-[var(--muted)]"><CalendarDays className="size-4" /> {t("joinedShort", { date: joined })}</p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--border)] pt-5 text-sm">
              <span><strong>{profile.followerCount}</strong> <span className="text-[var(--muted)]">{t("followers")}</span></span>
              <span><strong>{profile.followingCount}</strong> <span className="text-[var(--muted)]">{t("following")}</span></span>
              <span className="inline-flex items-center gap-1"><Heart className="size-4 text-[var(--brand)]" /><strong>{profile.totalLikes}</strong> <span className="text-[var(--muted)]">{t("likes")}</span></span>
            </div>
          </div>
        </section>

        <div className="mt-8 space-y-10">
          <ProfileSection icon={FileUser} title={t("charactersTitle")} count={profile.publicCharacterCount}>
            {characters.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {characters.map((character) => (
                  <article key={character.id} className="overflow-hidden rounded-[1rem] border border-[var(--border)] bg-[var(--surface)]">
                    <Link href={`/users/${profile.username}/sheets/${character.slug}`} className="block bg-[var(--keylime)] p-4">
                      <div className="rounded-xl border border-[#bddbc3] bg-[var(--surface)] p-4 shadow-sm">
                        <span className="text-[10px] font-bold tracking-wider text-[var(--muted)] uppercase">{character.gameSystem ?? t("unknownSystem")}</span>
                        <h3 className="mt-1 truncate text-xl font-black text-[var(--brand)]">{character.name}</h3>
                        <div className="mt-4 grid grid-cols-3 gap-1.5">{["КЗ 17", "HP 42", "LVL 5"].map((stat) => <span key={stat} className="rounded-md bg-[var(--keylime)] p-2 text-center text-[10px] font-black text-[var(--brand)]">{stat}</span>)}</div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-1 p-2.5">
                      <LikeButton characterId={character.id} initialLiked={character.likedByMe} initialCount={character.likeCount} authenticated={Boolean(session)} likeLabel={t("likeCharacter", { name: character.name })} unlikeLabel={t("unlikeCharacter", { name: character.name })} signInLabel={t("signInLike")} />
                      <div className="ml-auto"><RemixButton kind="character" itemId={character.id} compact authenticated={Boolean(session)} /></div>
                    </div>
                  </article>
                ))}
              </div>
            ) : <EmptyState text={t("emptyCharacters")} />}
          </ProfileSection>

          <ProfileSection icon={BookOpen} title={t("templatesTitle")} count={profile.publicTemplateCount}>
            {templates.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => (
                  <article key={template.id} className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="grid size-10 place-items-center rounded-xl bg-[#e7e0ff] text-[#50358f]"><BookOpen className="size-5" /></div>
                    <p className="mt-4 text-[10px] font-bold tracking-wider text-[var(--muted)] uppercase">{template.gameSystem ?? t("unknownSystem")}</p>
                    <h3 className="mt-1 truncate text-xl font-black"><Link href={`/community/${profile.username}/${template.slug ?? template.id}`} className="hover:text-[var(--brand)]">{template.title}</Link></h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">{t("pages", { count: template.pageCount })}</p>
                    <div className="mt-4 flex items-center gap-1 border-t pt-2.5">
                      <LikeButton templateId={template.id} initialLiked={Boolean(template.likedByMe)} initialCount={template.likeCount ?? 0} authenticated={Boolean(session)} likeLabel={t("likeTemplate", { name: template.title })} unlikeLabel={t("unlikeTemplate", { name: template.title })} signInLabel={t("signInLike")} />
                      <div className="ml-auto"><RemixButton kind="system" itemId={template.id} initialRemixed={ownProfile || Boolean(template.subscribed)} compact authenticated={Boolean(session)} /></div>
                    </div>
                  </article>
                ))}
              </div>
            ) : <EmptyState text={t("emptyTemplates")} />}
          </ProfileSection>
        </div>
      </main>
    </AppShell>
  );
}

function ProfileSection({ icon: Icon, title, count, children }: { icon: typeof Users; title: string; count: number; children: React.ReactNode }) {
  return <section><div className="mb-4 flex items-center gap-2"><Icon className="size-5 text-[var(--brand)]" /><h2 className="text-xl font-black">{title}</h2><span className="rounded-full bg-[var(--keylime)] px-2 py-0.5 text-xs font-bold text-[var(--brand)]">{count}</span></div>{children}</section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-[1rem] border border-dashed border-[var(--border)] bg-[var(--keylime)] p-8 text-center text-sm text-[var(--muted)]">{text}</div>;
}
