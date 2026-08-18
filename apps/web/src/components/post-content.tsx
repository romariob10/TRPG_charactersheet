"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, FileUser } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PostBlock, PostEmbed } from "@mycharacter/contracts";
import { LikeButton } from "@/components/social-like-button";
import { RemixButton } from "@/components/remix-button";

export function PostContent({
  blocks,
  embeds,
  authenticated = true,
}: {
  blocks: PostBlock[];
  embeds: PostEmbed[];
  authenticated?: boolean;
}) {
  const t = useTranslations("Posts");
  const embedMap = new Map(
    embeds.map((embed) => [`${embed.kind}:${embed.id}`, embed]),
  );

  return (
    <div className="post-content space-y-4">
      {blocks.map((block, index) => {
        if (block.type === "paragraph") {
          return (
            <p
              key={index}
              className="whitespace-pre-line text-[15px] leading-7 sm:text-base"
            >
              {block.data.text}
            </p>
          );
        }
        if (block.type === "header") {
          const className =
            block.data.level === 2
              ? "display-heading text-2xl text-[var(--brand)] sm:text-3xl"
              : block.data.level === 3
                ? "text-xl font-black text-[var(--brand)]"
                : "text-lg font-bold text-[var(--brand)]";
          return block.data.level === 2 ? (
            <h2 key={index} className={className}>
              {block.data.text}
            </h2>
          ) : block.data.level === 3 ? (
            <h3 key={index} className={className}>
              {block.data.text}
            </h3>
          ) : (
            <h4 key={index} className={className}>
              {block.data.text}
            </h4>
          );
        }
        if (block.type === "list") {
          const List = block.data.style === "ordered" ? "ol" : "ul";
          return (
            <List
              key={index}
              className={`space-y-1.5 pl-6 text-[15px] leading-7 sm:text-base ${block.data.style === "ordered" ? "list-decimal" : "list-disc"}`}
            >
              {block.data.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </List>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote
              key={index}
              className="rounded-r-xl border-l-4 border-[var(--brand)] bg-[var(--keylime)]/55 px-4 py-3 text-base italic leading-7"
            >
              <p>{block.data.text}</p>
              {block.data.caption && (
                <footer className="mt-2 text-sm not-italic text-[var(--muted)]">
                  — {block.data.caption}
                </footer>
              )}
            </blockquote>
          );
        }
        if (block.type === "delimiter") {
          return (
            <div
              key={index}
              className="py-1 text-center text-xl tracking-[.6em] text-[var(--muted)]"
            >
              •••
            </div>
          );
        }
        if (block.type === "image") {
          return (
            <figure
              key={index}
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]"
            >
              <Image
                src={`/api/post-images/${block.data.fileId}`}
                alt={block.data.caption || ""}
                width={1200}
                height={800}
                unoptimized
                className="h-auto max-h-[680px] w-full object-contain"
              />
              {block.data.caption && (
                <figcaption className="px-4 py-2.5 text-center text-xs text-[var(--muted)]">
                  {block.data.caption}
                </figcaption>
              )}
            </figure>
          );
        }
        const id =
          block.type === "character"
            ? block.data.characterId
            : block.data.templateId;
        const embed = embedMap.get(`${block.type}:${id}`);
        return embed ? (
          <EmbeddedEntityCard
            key={index}
            embed={embed}
            authenticated={authenticated}
            labels={{
              character: t("embed.character"),
              system: t("embed.system"),
              pages: t("embed.pages", { count: embed.pageCount }),
              like: t("embed.like", { title: embed.title }),
              unlike: t("embed.unlike", { title: embed.title }),
              signIn: t("embed.signIn"),
            }}
          />
        ) : null;
      })}
    </div>
  );
}

function EmbeddedEntityCard({
  embed,
  authenticated,
  labels,
}: {
  embed: PostEmbed;
  authenticated: boolean;
  labels: {
    character: string;
    system: string;
    pages: string;
    like: string;
    unlike: string;
    signIn: string;
  };
}) {
  const href =
    embed.kind === "system"
      ? `/community/${embed.author.username}/${embed.slug}`
      : `/users/${embed.author.username}/sheets/${embed.slug}`;
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]">
      <Link
        href={href}
        className="group flex items-center gap-4 p-4 hover:bg-[var(--keylime)]/45 sm:p-5"
      >
        <span
          className={`grid size-12 shrink-0 place-items-center rounded-xl ${embed.kind === "system" ? "bg-[#e7e0ff] text-[#50358f]" : "bg-[var(--brand)] text-white"}`}
        >
          {embed.kind === "system" ? (
            <BookOpen className="size-6" />
          ) : (
            <FileUser className="size-6" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold tracking-[.1em] text-[var(--muted)] uppercase">
            {embed.kind === "system" ? labels.system : labels.character}
          </span>
          <span className="mt-0.5 block truncate text-lg font-black text-[var(--brand)] group-hover:text-[var(--brand-strong)]">
            {embed.title}
          </span>
          <span className="block truncate text-xs text-[var(--muted)]">
            {embed.gameSystem ?? `@${embed.author.username}`} · {labels.pages}
          </span>
        </span>
      </Link>
      <footer className="flex items-center border-t border-[var(--border)] px-2.5 py-2">
        <LikeButton
          {...(embed.kind === "system"
            ? { templateId: embed.id }
            : { characterId: embed.id })}
          initialLiked={embed.likedByMe}
          initialCount={embed.likeCount}
          authenticated={authenticated}
          likeLabel={labels.like}
          unlikeLabel={labels.unlike}
          signInLabel={labels.signIn}
        />
        <div className="ml-auto">
          <RemixButton
            kind={embed.kind}
            itemId={embed.id}
            initialRemixed={embed.remixedByMe}
            compact
            authenticated={authenticated}
          />
        </div>
      </footer>
    </section>
  );
}
