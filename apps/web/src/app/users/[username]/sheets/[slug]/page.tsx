import type { Metadata } from "next";
import Link from "next/link";
import { FileUser, Globe2 } from "lucide-react";
import { notFound } from "next/navigation";
import { LikeButton } from "@/components/social-like-button";
import { RemixButton } from "@/components/remix-button";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth";
import { getPublicCharacter } from "@/lib/community";

interface RouteParams { username: string; slug: string }

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { username, slug } = await params;
  const character = await getPublicCharacter(username, slug);
  if (!character) return { title: "MyCharacter" };
  const title = `${character.name} · @${character.author.username}`;
  const description = `${character.name} — публичный лист персонажа ${character.gameSystem ?? "НРИ"}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { title, description, images: [] },
  };
}

export default async function PublicCharacterPage({ params }: { params: Promise<RouteParams> }) {
  const { username, slug } = await params;
  const [character, session] = await Promise.all([getPublicCharacter(username, slug), getSession()]);
  if (!character) notFound();

  return (
    <>
      <SiteHeader authenticated={Boolean(session)} />
      <main className="page-shell py-5 sm:py-8">
        <Link href={session ? "/dashboard/feed" : `/users/${username}`} className="text-sm font-bold text-[var(--brand)] hover:underline">← Назад в ленту</Link>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,720px)_minmax(250px,1fr)]">
          <article className="overflow-hidden rounded-[1.2rem] border border-[var(--border)] bg-[var(--surface)]">
            <div className="bg-[var(--keylime)] p-4 sm:p-7">
              <div className="mx-auto max-w-xl rounded-[1rem] border border-[#bddbc3] bg-[var(--surface)] p-5 shadow-[0_18px_45px_rgba(15,62,23,.1)] sm:p-8">
                <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
                  <div><p className="text-[10px] font-black tracking-[.14em] text-[var(--muted)] uppercase">{character.gameSystem ?? "Авторская система"}</p><h1 className="display-heading mt-1 text-3xl text-[var(--brand)] sm:text-4xl">{character.name}</h1></div>
                  <div className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-lg font-black text-white">5</div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">{[["Класс брони", "17"], ["Хиты", "42"], ["Скорость", "30"]].map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--keylime)] p-3 text-center"><div className="text-[9px] font-bold text-[var(--muted)] sm:text-[10px]">{label}</div><div className="mt-1 text-xl font-black text-[var(--brand)] sm:text-2xl">{value}</div></div>)}</div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2"><SheetBlock title="Характеристики" /><SheetBlock title="Навыки и владения" /></div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t p-3 sm:px-5">
              <LikeButton characterId={character.id} initialLiked={character.likedByMe} initialCount={character.likeCount} authenticated={Boolean(session)} likeLabel={`Лайкнуть ${character.name}`} unlikeLabel={`Убрать лайк с ${character.name}`} signInLabel="Войдите, чтобы поставить лайк" />
              <div className="ml-auto"><RemixButton kind="character" itemId={character.id} authenticated={Boolean(session)} /></div>
            </div>
          </article>
          <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
            <section className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-5"><p className="text-[10px] font-black tracking-[.13em] text-[var(--muted)] uppercase">Автор листа</p><Link href={`/users/${character.author.username}`} className="mt-4 flex items-center gap-3 rounded-xl hover:bg-[var(--keylime)]"><span className="grid size-11 place-items-center rounded-full bg-[var(--brand-soft)] font-black text-[var(--brand)]">{(character.author.displayName ?? character.author.username)[0].toUpperCase()}</span><span><strong className="block">{character.author.displayName ?? character.author.username}</strong><span className="text-sm text-[var(--muted)]">@{character.author.username}</span></span></Link></section>
            <section className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]"><p className="flex items-center gap-2 font-bold text-[var(--foreground)]"><Globe2 className="size-4 text-[var(--brand)]" /> Публичный лист</p><p className="mt-2 leading-6">Ремикс создаст вашу личную копию со всеми заполненными значениями. Оригинал автора не изменится.</p></section>
          </aside>
        </div>
      </main>
    </>
  );
}

function SheetBlock({ title }: { title: string }) {
  return <div className="rounded-xl border border-[var(--border)] p-4"><div className="flex items-center gap-2 text-xs font-black text-[var(--brand)]"><FileUser className="size-4" />{title}</div><div className="mt-3 space-y-2">{[78, 92, 61].map((width) => <div key={width} className="h-2 rounded-full bg-[var(--brand-soft)]" style={{ width: `${width}%` }} />)}</div></div>;
}
