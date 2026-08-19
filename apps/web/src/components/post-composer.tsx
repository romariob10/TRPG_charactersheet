"use client";

import { useState } from "react";
import { ImagePlus, LoaderCircle, Maximize2, PenLine, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SocialPost } from "@mycharacter/contracts";
import { usePostEditor, type PostEmbedOptions } from "@/lib/use-post-editor";
import { Button } from "@/components/ui/button";

export type { PostEmbedOptions };

export function PostComposer({
  authorName,
  userId,
  options,
  onCreated,
}: {
  authorName: string;
  userId?: string | null;
  options: PostEmbedOptions;
  onCreated: (post: SocialPost) => void;
}) {
  const t = useTranslations("Posts");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex w-full items-center gap-3 rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[0_8px_30px_rgba(15,62,23,0.04)] transition-colors hover:bg-[var(--keylime)]/45 sm:mb-5"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-sm font-black text-white">
          {authorName.slice(0, 1).toUpperCase()}
        </span>
        <span className="flex-1 text-sm text-[var(--muted)] sm:text-base">
          {t("startPost")}
        </span>
        <PenLine className="size-5 text-[var(--brand)]" />
      </button>
    );
  }

  return (
    <PostComposerExpanded
      userId={userId}
      options={options}
      onClose={() => setOpen(false)}
      onCreated={(post) => {
        onCreated(post);
        setOpen(false);
      }}
    />
  );
}

function PostComposerExpanded({
  userId,
  options,
  onClose,
  onCreated,
}: {
  userId?: string | null;
  options: PostEmbedOptions;
  onClose: () => void;
  onCreated: (post: SocialPost) => void;
}) {
  const t = useTranslations("Posts");

  const {
    holderRef,
    status,
    error,
    publish,
    persistCurrentDraft,
  } = usePostEditor({
    userId,
    options,
    placeholderText: t("placeholder"),
    imageCaptionText: t("imageCaption"),
    chooseImageText: t("chooseImage"),
    characterBlockText: t("characterBlock"),
    selectCharacterText: t("selectCharacter"),
    noPublicCharactersText: t("noPublicCharacters"),
    systemBlockText: t("systemBlock"),
    selectSystemText: t("selectSystem"),
    noPublicSystemsText: t("noPublicSystems"),
    onCreated,
  });

  const handleOpenInNewPage = async () => {
    const targetTab = window.open("", "_blank");
    await persistCurrentDraft();
    if (targetTab) {
      targetTab.location.href = "/dashboard/posts/new";
    }
  };

  const handlePublish = async () => {
    await publish();
  };

  return (
    <section className="relative mb-4 rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(15,62,23,0.06)] sm:mb-5">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div>
          <p className="font-bold">{t("newPost")}</p>
          <p className="text-xs text-[var(--muted)]">{t("editorHint")}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void handleOpenInNewPage()}
            className="grid size-9 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--brand)]"
            aria-label={t("openInNewPage")}
            title={t("openInNewPage")}
          >
            <Maximize2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--brand)]"
            aria-label={t("close")}
            title={t("close")}
          >
            <X className="size-4" />
          </button>
        </div>
      </header>
      <div ref={holderRef} className="post-editor min-h-[140px] px-4 py-3 sm:px-5" />
      {error && (
        <p
          role="alert"
          className="mx-4 mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:mx-5"
        >
          {error === "POST_EMPTY" ? t("empty") : t("publishFailed")}
        </p>
      )}
      <footer className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <ImagePlus className="size-4" /> {t("blocksHint")}
        </span>
        <Button
          type="button"
          size="sm"
          onClick={() => void handlePublish()}
          disabled={status === "publishing"}
        >
          {status === "publishing" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          {status === "publishing" ? t("publishing") : t("publish")}
        </Button>
      </footer>
    </section>
  );
}
