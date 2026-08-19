"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type EditorJS from "@editorjs/editorjs";
import type { OutputBlockData, OutputData } from "@editorjs/editorjs";
import type { PostBlock, SocialPost } from "@mycharacter/contracts";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { createEntityTool, type EntityOption } from "@/lib/editor-entity-tool";

export interface PostEmbedOptions {
  characters: EntityOption[];
  systems: EntityOption[];
}

export function getDraftKey(userId?: string | null): string {
  return `mycharacter:post-draft:v1:${userId ?? "anonymous"}`;
}

export function loadDraft(userId?: string | null): OutputData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OutputData;
    if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
      return parsed;
    }
  } catch {
    // Ignore invalid JSON in localStorage
  }
  return null;
}

export function saveDraft(userId: string | null | undefined, data: OutputData): void {
  if (typeof window === "undefined") return;
  try {
    if (!data.blocks || data.blocks.length === 0) {
      window.localStorage.removeItem(getDraftKey(userId));
    } else {
      window.localStorage.setItem(getDraftKey(userId), JSON.stringify(data));
    }
  } catch {
    // Storage quota or disabled localStorage
  }
}

export function clearDraftStorage(userId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getDraftKey(userId));
  } catch {
    // Ignore
  }
}

export interface UsePostEditorOptions {
  userId?: string | null;
  options: PostEmbedOptions;
  placeholderText?: string;
  imageCaptionText?: string;
  chooseImageText?: string;
  characterBlockText?: string;
  selectCharacterText?: string;
  noPublicCharactersText?: string;
  systemBlockText?: string;
  selectSystemText?: string;
  noPublicSystemsText?: string;
  onCreated?: (post: SocialPost) => void;
  autofocus?: boolean;
  minHeight?: number;
  initialData?: OutputData | null;
}

export function usePostEditor({
  userId,
  options,
  placeholderText = "Расскажите историю…",
  imageCaptionText = "Подпись к изображению",
  chooseImageText = "Выбрать изображение",
  characterBlockText = "Персонаж",
  selectCharacterText = "Выберите публичного персонажа",
  noPublicCharactersText = "Сначала опубликуйте персонажа",
  systemBlockText = "Система НРИ",
  selectSystemText = "Выберите публичную систему",
  noPublicSystemsText = "Сначала опубликуйте систему",
  onCreated,
  autofocus = true,
  minHeight = 180,
  initialData,
}: UsePostEditorOptions) {
  const [status, setStatus] = useState<"idle" | "publishing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const holderRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorJS | null>(null);

  const persistCurrentDraft = useCallback(async (): Promise<OutputData | null> => {
    if (!editorRef.current) return null;
    try {
      const output = await editorRef.current.save();
      saveDraft(userId, output);
      return output;
    } catch {
      return null;
    }
  }, [userId]);

  useEffect(() => {
    if (!holderRef.current || editorRef.current) return;
    let cancelled = false;

    const draftData = initialData ?? loadDraft(userId);

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
        const editor = new Editor({
          holder: holderRef.current,
          autofocus,
          placeholder: placeholderText,
          inlineToolbar: true,
          minHeight,
          data: draftData ?? undefined,
          tools: {
            header: {
              class: headerModule.default,
              config: { levels: [2, 3, 4], defaultLevel: 2 },
            },
            list: { class: listModule.default, inlineToolbar: true },
            image: {
              class: imageModule.default,
              config: {
                captionPlaceholder: imageCaptionText,
                buttonContent: chooseImageText,
                uploader: { uploadByFile: uploadImage },
              },
            },
            quote: { class: quoteModule.default, inlineToolbar: true },
            delimiter: delimiterModule.default,
            character: createEntityTool("character", {
              title: characterBlockText,
              selectText: selectCharacterText,
              emptyText: noPublicCharactersText,
              options: options.characters,
            }),
            system: createEntityTool("system", {
              title: systemBlockText,
              selectText: selectSystemText,
              emptyText: noPublicSystemsText,
              options: options.systems,
            }),
          },
          onChange: () => {
            void persistCurrentDraft();
          },
          onReady: () => {
            if (!cancelled) {
              setIsReady(true);
            }
          },
        });
        editorRef.current = editor;
      },
    );

    return () => {
      cancelled = true;
      const editor = editorRef.current;
      editorRef.current = null;
      setIsReady(false);
      if (editor) {
        void editor.isReady.then(() => editor.destroy()).catch(() => undefined);
      }
    };
  }, [
    autofocus,
    minHeight,
    placeholderText,
    imageCaptionText,
    chooseImageText,
    characterBlockText,
    selectCharacterText,
    noPublicCharactersText,
    systemBlockText,
    selectSystemText,
    noPublicSystemsText,
    options.characters,
    options.systems,
    userId,
    initialData,
    persistCurrentDraft,
  ]);

  const publish = useCallback(async (): Promise<SocialPost | null> => {
    if (!editorRef.current) return null;
    setStatus("publishing");
    setError(null);
    try {
      const output = await editorRef.current.save();
      const blocks = output.blocks
        .map(normalizeEditorBlock)
        .filter(isPostBlock);

      if (blocks.length === 0) {
        throw new ApiClientError("Post is empty", 400, "POST_EMPTY");
      }

      const post = await apiFetch<SocialPost>("/api/posts", {
        method: "POST",
        body: JSON.stringify({ blocks }),
      });

      clearDraftStorage(userId);
      await editorRef.current.clear();
      onCreated?.(post);
      return post;
    } catch (reason) {
      const message =
        reason instanceof ApiClientError && reason.code === "POST_EMPTY"
          ? "POST_EMPTY"
          : reason instanceof Error
            ? reason.message
            : "PUBLISH_FAILED";
      setError(message);
      return null;
    } finally {
      setStatus("idle");
    }
  }, [userId, onCreated]);

  const clear = useCallback(async () => {
    if (editorRef.current) {
      await editorRef.current.clear();
    }
    clearDraftStorage(userId);
    setError(null);
  }, [userId]);

  return {
    holderRef,
    editorRef,
    status,
    error,
    isReady,
    publish,
    clear,
    persistCurrentDraft,
  };
}

export async function uploadImage(file: File) {
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

export function normalizeEditorBlock(block: OutputBlockData): PostBlock | null {
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

export function isPostBlock(block: PostBlock | null): block is PostBlock {
  return block !== null;
}
