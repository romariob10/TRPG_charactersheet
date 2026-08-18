"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { MyProfile } from "@/lib/types";
import { usePostEditor, type PostEmbedOptions } from "@/lib/use-post-editor";
import { Button, buttonClassName } from "@/components/ui/button";

export function FullPostEditor({
  profile,
  embedOptions,
}: {
  profile: MyProfile;
  embedOptions: PostEmbedOptions;
}) {
  const t = useTranslations("Posts");
  const router = useRouter();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const {
    holderRef,
    status,
    error,
    publish,
    clear,
  } = usePostEditor({
    userId: profile.id,
    options: embedOptions,
    placeholderText: t("placeholder"),
    imageCaptionText: t("imageCaption"),
    chooseImageText: t("chooseImage"),
    characterBlockText: t("characterBlock"),
    selectCharacterText: t("selectCharacter"),
    noPublicCharactersText: t("noPublicCharacters"),
    systemBlockText: t("systemBlock"),
    selectSystemText: t("selectSystem"),
    noPublicSystemsText: t("noPublicSystems"),
    onCreated: () => {
      router.push("/dashboard/feed");
    },
  });

  const handlePublish = async () => {
    await publish();
  };

  const handleClearDraft = async () => {
    await clear();
    setConfirmClearOpen(false);
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Top action header */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/feed"
              className={
                buttonClassName({ variant: "ghost", size: "sm" }) +
                " gap-1.5 text-[var(--muted)] hover:text-[var(--brand)]"
              }
            >
              <ArrowLeft className="size-4" />
              <span>{t("backToFeed")}</span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-red-700"
              title={t("clearDraft")}
            >
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">{t("clearDraft")}</span>
            </button>

            <Button
              type="button"
              size="sm"
              onClick={() => void handlePublish()}
              disabled={status === "publishing"}
              className="min-w-[7.5rem] shadow-sm"
            >
              {status === "publishing" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              <span>
                {status === "publishing" ? t("publishing") : t("publish")}
              </span>
            </Button>
          </div>
        </div>
      </header>

      {/* Confirmation modal for clearing draft */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
            <p className="font-bold text-[var(--brand)]">
              {t("discardDraftConfirm")}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmClearOpen(false)}
              >
                Отмена
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => void handleClearDraft()}
              >
                {t("clearDraft")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Editor Content Area */}
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_8px_30px_rgba(15,62,23,0.04)] sm:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-[var(--brand)] uppercase">
                <Sparkles className="size-3.5" />
                {t("fullEditorTitle")}
              </div>
              <p className="mt-0.5 text-xs text-[var(--muted)] sm:text-sm">
                {t("fullEditorSubtitle")}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--brand)]">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              <span>{t("draftSaved")}</span>
            </div>
          </div>

          <div
            ref={holderRef}
            className="post-editor min-h-[420px] px-2 py-4 sm:px-4"
          />

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              {error === "POST_EMPTY" ? t("empty") : t("publishFailed")}
            </p>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
            <span className="flex items-center gap-1.5">
              <ImagePlus className="size-4 text-[var(--brand)]" />
              {t("blocksHint")}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
