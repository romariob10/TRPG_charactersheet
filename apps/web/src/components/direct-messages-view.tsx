"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  MessageSquare,
  Paperclip,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  CharacterSummary,
  DirectConversationSummary,
  DirectMessage,
  ListConversationsResponse,
  TemplateSummary,
} from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import { formatRelativeDate } from "@/lib/utils";
import { Popover } from "@/components/ui/popover";

interface AttachedImage {
  id: string;
  url: string;
}

const MESSAGE_COMPOSER_MAX_HEIGHT = 144;

function resizeMessageComposer(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  const nextHeight = Math.min(
    textarea.scrollHeight,
    MESSAGE_COMPOSER_MAX_HEIGHT,
  );
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY =
    textarea.scrollHeight > MESSAGE_COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
}

export function DirectMessagesView({
  initialConversations,
  currentUserId,
  locale,
  initialConversationId,
}: {
  initialConversations: DirectConversationSummary[];
  currentUserId: string;
  locale: string;
  initialConversationId?: string | null;
}) {
  const t = useTranslations("DirectMessages");
  const [conversations, setConversations] =
    useState<DirectConversationSummary[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversationId ?? initialConversations[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(selectedId !== null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);

  // Embed items state for attachments popover
  const [myCharacters, setMyCharacters] = useState<CharacterSummary[]>([]);
  const [mySystems, setMySystems] = useState<TemplateSummary[]>([]);
  const [loadingEmbeds, setLoadingEmbeds] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const forceAutoScrollRef = useRef(true);
  const selectedIdRef = useRef(selectedId);
  const messagesRef = useRef(messages);
  const readConversationIdsRef = useRef(new Set<string>());
  const messagesRequestIdRef = useRef(0);
  const conversationsRequestIdRef = useRef(0);

  const selectedConversation = conversations.find((c) => c.id === selectedId);

  const loadConversations = useCallback(async (): Promise<
    DirectConversationSummary[] | null
  > => {
    const requestId = ++conversationsRequestIdRef.current;
    try {
      const res = await apiFetch<ListConversationsResponse>(
        "/api/messages/conversations",
      );
      if (requestId !== conversationsRequestIdRef.current) return null;
      const openConversationId = selectedIdRef.current;
      setConversations(
        res.conversations.map((conversation) =>
          openConversationId === conversation.id &&
          readConversationIdsRef.current.has(conversation.id)
            ? { ...conversation, unreadCount: 0 }
            : conversation,
        ),
      );
      return res.conversations;
    } catch {
      return null;
    }
  }, []);

  const loadMessages = useCallback(
    (convId: string): Promise<boolean> => {
      const requestId = ++messagesRequestIdRef.current;
      return apiFetch<{ messages: DirectMessage[] }>(
        `/api/messages/conversations/${convId}`,
      )
        .then((res) => {
          if (
            requestId !== messagesRequestIdRef.current ||
            selectedIdRef.current !== convId
          ) {
            return false;
          }
          const previousMessageIds = new Set(
            messagesRef.current.map((message) => message.id),
          );
          const receivedIncomingMessage = res.messages.some(
            (message) =>
              message.senderId !== currentUserId &&
              !previousMessageIds.has(message.id),
          );
          readConversationIdsRef.current.add(convId);
          setMessages(res.messages);
          setConversations((prev) =>
            prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c)),
          );
          if (receivedIncomingMessage) {
            window.dispatchEvent(new Event("direct-messages:read"));
          }
          return true;
        })
        .catch(() => {
          if (
            requestId === messagesRequestIdRef.current &&
            selectedIdRef.current === convId
          ) {
            readConversationIdsRef.current.delete(convId);
          }
          return false;
        })
        .finally(() => {
          if (
            requestId === messagesRequestIdRef.current &&
            selectedIdRef.current === convId
          ) {
            setLoadingMessages(false);
          }
        });
    },
    [currentUserId],
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
    forceAutoScrollRef.current = true;
    shouldAutoScrollRef.current = true;
  }, [selectedId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId);

    return () => {
      messagesRequestIdRef.current += 1;
    };
  }, [loadMessages, selectedId]);

  // Polling for updates
  useEffect(() => {
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const conversationId = selectedIdRef.current;
        if (conversationId) await loadMessages(conversationId);
        const refreshedConversations = await loadConversations();
        const openConversation = refreshedConversations?.find(
          (conversation) => conversation.id === conversationId,
        );
        if (
          conversationId &&
          selectedIdRef.current === conversationId &&
          openConversation &&
          openConversation.unreadCount > 0
        ) {
          const caughtUp = await loadMessages(conversationId);
          if (!caughtUp) {
            setConversations((previous) =>
              previous.map((conversation) =>
                conversation.id === conversationId
                  ? {
                      ...conversation,
                      unreadCount: openConversation.unreadCount,
                    }
                  : conversation,
              ),
            );
          }
        }
      } finally {
        refreshing = false;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(() => void refresh(), 6000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadConversations, loadMessages]);

  useEffect(() => {
    if (!forceAutoScrollRef.current && !shouldAutoScrollRef.current) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: forceAutoScrollRef.current ? "auto" : "smooth",
    });
    forceAutoScrollRef.current = false;
    shouldAutoScrollRef.current = true;
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) resizeMessageComposer(textareaRef.current);
  }, [draft]);

  async function loadEmbedOptions() {
    if (myCharacters.length > 0 || mySystems.length > 0) return;
    setLoadingEmbeds(true);
    try {
      const [charsRes, systemsRes] = await Promise.all([
        apiFetch<{ items: CharacterSummary[] }>("/api/characters").catch(
          () => ({ items: [] }),
        ),
        apiFetch<{ items: TemplateSummary[] }>("/api/templates").catch(() => ({
          items: [],
        })),
      ]);
      setMyCharacters(charsRes.items);
      setMySystems(systemsRes.items);
    } finally {
      setLoadingEmbeds(false);
    }
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const conversationId = selectedIdRef.current;
    if (!file || !conversationId) return;

    setImageUploadError(false);
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch<{
        success: number;
        file: { url: string; id: string };
      }>(`/api/messages/conversations/${conversationId}/images`, {
        method: "POST",
        body: formData,
      });
      if (res.file?.url && selectedIdRef.current === conversationId) {
        setAttachedImages((prev) => [
          ...prev,
          { id: res.file.id, url: res.file.url },
        ]);
      }
    } catch {
      setImageUploadError(true);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleAttachCharacter(char: CharacterSummary) {
    const link = `\n[Лист персонажа: «${char.name}»](${window.location.origin}/characters/${char.id})`;
    setDraft((prev) => (prev ? `${prev.trimEnd()}${link}` : link.trimStart()));
    textareaRef.current?.focus();
  }

  function handleAttachSystem(sys: TemplateSummary) {
    const link = `\n[Система: «${sys.title}»](${window.location.origin}/systems/${sys.id})`;
    setDraft((prev) => (prev ? `${prev.trimEnd()}${link}` : link.trimStart()));
    textareaRef.current?.focus();
  }

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (
      (!draft.trim() && attachedImages.length === 0) ||
      !selectedId ||
      sending
    )
      return;

    let bodyText = draft.trim();
    if (attachedImages.length > 0) {
      const imagesMarkdown = attachedImages
        .map((img) => `\n![image](${img.url})`)
        .join("");
      bodyText = bodyText
        ? `${bodyText}${imagesMarkdown}`
        : imagesMarkdown.trim();
    }

    setDraft("");
    setAttachedImages([]);
    setSending(true);
    forceAutoScrollRef.current = true;

    try {
      const newMsg = await apiFetch<DirectMessage>(
        `/api/messages/conversations/${selectedId}`,
        {
          method: "POST",
          body: JSON.stringify({ body: bodyText }),
        },
      );
      setMessages((prev) => [...prev, newMsg]);
      void loadConversations();
    } catch {
      setDraft(draft);
    } finally {
      setSending(false);
    }
  }

  function scrollMessagesWithKeyboard(key: string): boolean {
    const scroller = messagesScrollRef.current;
    if (!scroller) return false;
    const page = Math.max(120, scroller.clientHeight * 0.8);
    if (key === "PageUp") scroller.scrollBy({ top: -page, behavior: "auto" });
    else if (key === "PageDown")
      scroller.scrollBy({ top: page, behavior: "auto" });
    else if (key === "Home") scroller.scrollTo({ top: 0, behavior: "auto" });
    else if (key === "End")
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "auto" });
    else if (key === "ArrowUp")
      scroller.scrollBy({ top: -48, behavior: "auto" });
    else if (key === "ArrowDown")
      scroller.scrollBy({ top: 48, behavior: "auto" });
    else return false;
    return true;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="grid h-[calc(100vh-140px)] min-h-[500px] grid-cols-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm md:grid-cols-12">
      {/* Left Pane: Conversations List */}
      <div className="flex flex-col border-r border-[var(--border)] md:col-span-4 lg:col-span-4 bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] p-4">
          <h1 className="text-lg font-bold text-[var(--foreground)]">
            {t("title")}
          </h1>
          <p className="text-xs text-[var(--muted)]">{t("subtitle")}</p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]">
          {conversations.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare className="mx-auto size-8 text-[var(--muted)] opacity-40" />
              <p className="mt-2 text-sm font-bold text-[var(--foreground)]">
                {t("noConversations")}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {t("noConversationsHint")}
              </p>
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = conv.id === selectedId;
              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    if (conv.id === selectedId) return;
                    setImageUploadError(false);
                    setAttachedImages([]);
                    setLoadingMessages(true);
                    setMessages([]);
                    setSelectedId(conv.id);
                  }}
                  className={
                    "flex items-center gap-3 p-3.5 cursor-pointer transition-colors " +
                    (isSelected
                      ? "bg-[var(--keylime)]/80"
                      : "hover:bg-[var(--keylime)]/40")
                  }
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] font-bold text-[var(--brand)]">
                    {conv.participant.displayName?.[0]?.toUpperCase() ??
                      conv.participant.username[0]?.toUpperCase() ??
                      "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[var(--foreground)] truncate">
                        {conv.participant.displayName ||
                          conv.participant.username}
                      </span>
                      <span className="text-[10px] font-medium text-[var(--muted)] shrink-0">
                        {formatRelativeDate(conv.lastMessageAt, locale)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-[var(--muted)] truncate">
                        {conv.lastMessage?.body || "No messages yet"}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="ml-2 flex size-4.5 items-center justify-center rounded-full bg-[var(--brand)] text-[10px] font-black text-white shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Pane: Chat Thread */}
      <div
        className="flex min-h-0 flex-col overflow-hidden bg-[var(--surface)] md:col-span-8 lg:col-span-8"
        onKeyDownCapture={(event) => {
          if (
            (event.key === "PageUp" || event.key === "PageDown") &&
            scrollMessagesWithKeyboard(event.key)
          ) {
            event.preventDefault();
          }
        }}
      >
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] p-4 bg-[var(--surface)]">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-full bg-[var(--brand-soft)] font-bold text-[var(--brand)]">
                  {selectedConversation.participant.displayName?.[0]?.toUpperCase() ??
                    selectedConversation.participant.username[0]?.toUpperCase() ??
                    "?"}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[var(--foreground)]">
                    {selectedConversation.participant.displayName ||
                      selectedConversation.participant.username}
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    @{selectedConversation.participant.username}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div
              ref={messagesScrollRef}
              data-testid="direct-messages-scroll"
              tabIndex={0}
              aria-label={t("messagesHistory")}
              className="min-h-0 flex-1 overscroll-contain overflow-y-auto p-4 space-y-3 bg-[var(--surface)]"
              onKeyDown={(event) => {
                if (
                  !event.defaultPrevented &&
                  scrollMessagesWithKeyboard(event.key)
                ) {
                  event.preventDefault();
                }
              }}
              onScroll={(event) => {
                const element = event.currentTarget;
                shouldAutoScrollRef.current =
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <=
                  48;
              }}
            >
              {loadingMessages && messages.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--muted)]">
                  <LoaderCircle className="inline size-4 animate-spin mr-1.5" />
                  <span>Loading chat…</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="py-16 text-center text-xs text-[var(--muted)]">
                  {t("noConversationsHint")}
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.senderId === currentUserId;
                  return (
                    <div
                      key={msg.id}
                      className={
                        "flex flex-col " +
                        (isMine ? "items-end" : "items-start")
                      }
                    >
                      <div
                        className={
                          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-xs " +
                          (isMine
                            ? "bg-[var(--brand)] text-white rounded-br-none"
                            : "bg-[var(--surface-strong)] text-[var(--foreground)] rounded-bl-none border border-[var(--border)]")
                        }
                      >
                        <MessageBody text={msg.body} isMine={isMine} />
                      </div>
                      <span className="mt-1 text-[10px] text-[var(--muted)] px-1">
                        {formatRelativeDate(msg.createdAt, locale)}
                        {isMine && msg.readAt && " · Read"}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Attached Images Previews */}
            {attachedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-[var(--border)] bg-[var(--surface-strong)] px-3.5 py-2">
                {attachedImages.map((img, index) => (
                  <div
                    key={img.id || index}
                    className="relative group size-14 rounded-lg overflow-hidden border border-[var(--border)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt="Attachment preview"
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setAttachedImages((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                      className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full bg-black/70 text-white hover:bg-red-600 transition-colors"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Message Input Box */}
            <form
              onSubmit={(e) => void handleSend(e)}
              className="border-t border-[var(--border)] p-3 bg-[var(--surface)] flex flex-col gap-1.5"
            >
              {imageUploadError && (
                <p role="alert" className="px-2 text-xs font-medium text-red-600">
                  {t("imageUploadFailed")}
                </p>
              )}
              <div className="flex items-end gap-2">
                {/* Image upload button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void handleImageSelect(e)}
                />
                <button
                  type="button"
                  disabled={uploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                  title={t("attachImage")}
                  aria-label={t("attachImage")}
                  className="grid size-9 shrink-0 place-items-center rounded-xl text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--brand)] disabled:opacity-50"
                >
                  {uploadingImage ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <ImageIcon className="size-4" />
                  )}
                </button>

                {/* Character/System Embed Popover */}
                <Popover
                  label={t("attachSheet")}
                  align="start"
                  trigger={() => (
                    <span
                      onClick={() => void loadEmbedOptions()}
                      title={t("attachSheet")}
                      className="grid size-9 shrink-0 place-items-center rounded-xl text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--brand)] cursor-pointer"
                    >
                      <Paperclip className="size-4" />
                    </span>
                  )}
                >
                  {({ close }) => (
                    <div className="w-64 max-h-72 overflow-y-auto p-2 space-y-2 text-xs">
                      {loadingEmbeds ? (
                        <div className="p-3 text-center text-[var(--muted)]">
                          <LoaderCircle className="inline size-4 animate-spin mr-1" />
                          <span>Loading…</span>
                        </div>
                      ) : (
                        <>
                          {/* Characters section */}
                          {myCharacters.length > 0 && (
                            <div>
                              <p className="font-bold text-[var(--foreground)] px-2 py-1 flex items-center gap-1.5">
                                <FileText className="size-3.5 text-[var(--brand)]" />
                                <span>{t("myCharacters")}</span>
                              </p>
                              <div className="space-y-0.5 mt-1">
                                {myCharacters.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      handleAttachCharacter(c);
                                      close();
                                    }}
                                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--keylime)] truncate"
                                  >
                                    <p className="font-medium text-[var(--foreground)] truncate">
                                      {c.name}
                                    </p>
                                    <p className="text-[10px] text-[var(--muted)] truncate">
                                      {c.gameSystem}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Systems section */}
                          {mySystems.length > 0 && (
                            <div>
                              <p className="font-bold text-[var(--foreground)] px-2 py-1 flex items-center gap-1.5 border-t border-[var(--border)] pt-2">
                                <Sparkles className="size-3.5 text-[var(--brand)]" />
                                <span>{t("mySystems")}</span>
                              </p>
                              <div className="space-y-0.5 mt-1">
                                {mySystems.map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                      handleAttachSystem(s);
                                      close();
                                    }}
                                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--keylime)] truncate"
                                  >
                                    <p className="font-medium text-[var(--foreground)] truncate">
                                      {s.title}
                                    </p>
                                    <p className="text-[10px] text-[var(--muted)] truncate">
                                      {s.gameSystem}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {myCharacters.length === 0 &&
                            mySystems.length === 0 && (
                              <p className="p-3 text-center text-[var(--muted)]">
                                Нет доступных листов или систем
                              </p>
                            )}
                        </>
                      )}
                    </div>
                  )}
                </Popover>

                {/* Multiline textarea */}
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("placeholder")}
                  maxLength={2000}
                  className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] min-h-[38px] max-h-36 leading-normal"
                />

                <button
                  type="submit"
                  disabled={
                    (!draft.trim() && attachedImages.length === 0) || sending
                  }
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-white shadow-xs transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </button>
              </div>

              <span className="text-[10px] text-[var(--muted)] pl-2">
                {t("sendHint")}
              </span>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-[var(--muted)] bg-[var(--surface)]">
            <MessageSquare className="size-12 opacity-30" />
            <p className="mt-3 text-sm font-semibold">
              {t("selectConversation")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type MessageTextPart =
  | { type: "plain"; content: string }
  | { type: "link"; title: string; url: string };

function safeMessageUrl(value: string): string | null {
  const url = value.trim();
  if (/^\/(?!\/)[^\s\\]*$/.test(url)) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : null;
  } catch {
    return null;
  }
}

function appendAutoLinkedText(parts: MessageTextPart[], content: string): void {
  const autoLinkRegex = /https?:\/\/[^\s<>()]+|\/invites\/[A-Za-z0-9_-]+/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = autoLinkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "plain",
        content: content.substring(lastIndex, match.index),
      });
    }

    const trailingPunctuation = match[0].match(/[.,!?;:]+$/)?.[0] ?? "";
    const candidate = trailingPunctuation
      ? match[0].slice(0, -trailingPunctuation.length)
      : match[0];
    const url = safeMessageUrl(candidate);
    if (url) parts.push({ type: "link", title: candidate, url });
    else parts.push({ type: "plain", content: candidate });
    if (trailingPunctuation) {
      parts.push({ type: "plain", content: trailingPunctuation });
    }
    lastIndex = autoLinkRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "plain", content: content.substring(lastIndex) });
  }
}

/** Helper component to parse and safely render message text and links. */
function MessageBody({ text, isMine }: { text: string; isMine: boolean }) {
  // Regex to detect markdown images: ![alt](url)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  // Split text by images first
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(text)) !== null) {
    const imageUrl = safeMessageUrl(match[2]);
    if (imageUrl) {
      if (match.index > lastIndex) {
        parts.push({
          type: "text" as const,
          content: text.substring(lastIndex, match.index),
        });
      }
      parts.push({
        type: "image" as const,
        alt: match[1] || "Image",
        url: imageUrl,
      });
      lastIndex = imageRegex.lastIndex;
    }
  }

  if (lastIndex < text.length) {
    parts.push({
      type: "text" as const,
      content: text.substring(lastIndex),
    });
  }

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        if (part.type === "image") {
          return (
            <div key={i} className="my-1 overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={part.url}
                alt={part.alt}
                className="max-h-72 max-w-full rounded-xl object-contain border border-black/10 shadow-xs"
              />
            </div>
          );
        }

        // Parse markdown links inside text part
        const textContent = part.content;
        const textParts: MessageTextPart[] = [];
        let tLastIndex = 0;
        let linkMatch;

        while ((linkMatch = linkRegex.exec(textContent)) !== null) {
          if (linkMatch.index > tLastIndex) {
            appendAutoLinkedText(
              textParts,
              textContent.substring(tLastIndex, linkMatch.index),
            );
          }
          const url = safeMessageUrl(linkMatch[2]);
          if (url) {
            textParts.push({
              type: "link",
              title: linkMatch[1],
              url,
            });
          } else {
            textParts.push({ type: "plain", content: linkMatch[0] });
          }
          tLastIndex = linkRegex.lastIndex;
        }

        if (tLastIndex < textContent.length) {
          appendAutoLinkedText(textParts, textContent.substring(tLastIndex));
        }

        return (
          <p
            key={i}
            className="whitespace-pre-wrap break-words leading-relaxed"
          >
            {textParts.map((tp, j) => {
              if (tp.type === "link") {
                return (
                  <Link
                    key={j}
                    href={tp.url}
                    className={
                      "inline-flex items-center gap-1 font-bold underline underline-offset-2 " +
                      (isMine
                        ? "text-white hover:text-white/80"
                        : "text-[var(--brand)] hover:underline")
                    }
                  >
                    <span>{tp.title}</span>
                  </Link>
                );
              }
              return <span key={j}>{tp.content}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}
