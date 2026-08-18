"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, PenLine, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type EditorJS from "@editorjs/editorjs";
import type { OutputBlockData } from "@editorjs/editorjs";
import type { PostBlock, SocialPost } from "@mycharacter/contracts";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { createEntityTool, type EntityOption } from "@/lib/editor-entity-tool";
import { Button } from "@/components/ui/button";

export interface PostEmbedOptions {
  characters: EntityOption[];
  systems: EntityOption[];
}

export function PostComposer({
  authorName,
  options,
  onCreated,
}: {
  authorName: string;
  options: PostEmbedOptions;
  onCreated: (post: SocialPost) => void;
}) {
  const t = useTranslations("Posts");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "publishing">("idle");
  const [error, setError] = useState<string | null>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorJS | null>(null);

  useEffect(() => {
    if (!open || !holderRef.current || editorRef.current) return;
    let cancelled = false;
    void Promise.all([
      import("@editorjs/editorjs"),
      import("@editorjs/header"),
      import("@editorjs/list"),
      import("@editorjs/image"),
      import("@editorjs/quote"),
      import("@editorjs/delimiter"),
    ]).then(
      ([
        editorModule,
        headerModule,
        listModule,
        imageModule,
        quoteModule,
        delimiterModule,
      ]) => {
        if (cancelled || !holderRef.current) return;
        const Editor = editorModule.default;
        editorRef.current = new Editor({
          holder: holderRef.current,
          autofocus: true,
          placeholder: t("placeholder"),
          inlineToolbar: true,
          minHeight: 180,
          tools: {
            header: {
              class: headerModule.default,
              config: { levels: [2, 3, 4], defaultLevel: 2 },
            },
            list: { class: listModule.default, inlineToolbar: true },
            image: {
              class: imageModule.default,
              config: {
                captionPlaceholder: t("imageCaption"),
                buttonContent: t("chooseImage"),
                uploader: { uploadByFile: uploadImage },
              },
            },
            quote: { class: quoteModule.default, inlineToolbar: true },
            delimiter: delimiterModule.default,
            character: createEntityTool("character", {
              title: t("characterBlock"),
              selectText: t("selectCharacter"),
              emptyText: t("noPublicCharacters"),
              options: options.characters,
            }),
            system: createEntityTool("system", {
              title: t("systemBlock"),
              selectText: t("selectSystem"),
              emptyText: t("noPublicSystems"),
              options: options.systems,
            }),
          },
        });
      },
    );
    return () => {
      cancelled = true;
      const editor = editorRef.current;
      editorRef.current = null;
      if (editor)
        void editor.isReady.then(() => editor.destroy()).catch(() => undefined);
    };
  }, [open, options.characters, options.systems, t]);

  async function publish() {
    if (!editorRef.current) return;
    setStatus("publishing");
    setError(null);
    try {
      const output = await editorRef.current.save();
      const blocks = output.blocks
        .map(normalizeEditorBlock)
        .filter(isPostBlock);
      const post = await apiFetch<SocialPost>("/api/posts", {
        method: "POST",
        body: JSON.stringify({ blocks }),
      });
      onCreated(post);
      await editorRef.current.clear();
      setOpen(false);
    } catch (reason) {
      setError(
        reason instanceof ApiClientError && reason.code === "POST_EMPTY"
          ? t("empty")
          : reason instanceof Error
            ? reason.message
            : t("publishFailed"),
      );
    } finally {
      setStatus("idle");
    }
  }

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
    <section className="mb-4 overflow-hidden rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(15,62,23,0.06)] sm:mb-5">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div>
          <p className="font-bold">{t("newPost")}</p>
          <p className="text-xs text-[var(--muted)]">{t("editorHint")}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid size-9 place-items-center rounded-full hover:bg-[var(--keylime)]"
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </header>
      <div ref={holderRef} className="post-editor px-4 py-3 sm:px-5" />
      {error && (
        <p
          role="alert"
          className="mx-4 mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:mx-5"
        >
          {error}
        </p>
      )}
      <footer className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <ImagePlus className="size-4" /> {t("blocksHint")}
        </span>
        <Button
          type="button"
          size="sm"
          onClick={() => void publish()}
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

async function uploadImage(file: File) {
  const form = new FormData();
  form.append("image", file);
  const response = await fetch("/api/posts/images", {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  const body = (await response.json()) as {
    success?: number;
    file?: { url: string; id: string };
    error?: { message?: string };
  };
  if (!response.ok || body.success !== 1 || !body.file) {
    throw new Error(body.error?.message ?? "Image upload failed.");
  }
  return body as { success: 1; file: { url: string; id: string } };
}

function normalizeEditorBlock(block: OutputBlockData): PostBlock | null {
  const data = block.data as Record<string, unknown>;
  if (block.type === "paragraph" && typeof data.text === "string") {
    return { type: "paragraph", data: { text: data.text } };
  }
  if (block.type === "header" && typeof data.text === "string") {
    const level = Number(data.level);
    return {
      type: "header",
      data: { text: data.text, level: level >= 2 && level <= 4 ? level : 2 },
    };
  }
  if (block.type === "list") {
    const items = flattenListItems(data.items);
    const style =
      data.style === "ordered" || data.style === "checklist"
        ? data.style
        : "unordered";
    return items.length ? { type: "list", data: { style, items } } : null;
  }
  if (block.type === "quote" && typeof data.text === "string") {
    return {
      type: "quote",
      data: {
        text: data.text,
        caption: typeof data.caption === "string" ? data.caption : "",
      },
    };
  }
  if (block.type === "delimiter") return { type: "delimiter", data: {} };
  if (block.type === "image") {
    const file = data.file as { id?: unknown } | undefined;
    return typeof file?.id === "string"
      ? {
          type: "image",
          data: {
            fileId: file.id,
            caption: typeof data.caption === "string" ? data.caption : "",
          },
        }
      : null;
  }
  if (block.type === "character" && typeof data.characterId === "string") {
    return { type: "character", data: { characterId: data.characterId } };
  }
  if (block.type === "system" && typeof data.templateId === "string") {
    return { type: "system", data: { templateId: data.templateId } };
  }
  return null;
}

function flattenListItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!item || typeof item !== "object") return [];
    const record = item as { content?: unknown; items?: unknown };
    return [
      ...(typeof record.content === "string" ? [record.content] : []),
      ...flattenListItems(record.items),
    ];
  });
}

function isPostBlock(block: PostBlock | null): block is PostBlock {
  return block !== null;
}
