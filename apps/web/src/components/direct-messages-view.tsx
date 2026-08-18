"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Send,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  DirectConversationSummary,
  DirectMessage,
  ListConversationsResponse,
} from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import { formatRelativeDate } from "@/lib/utils";

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
  const [conversations, setConversations] = useState<DirectConversationSummary[]>(
    initialConversations,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversationId ?? (initialConversations[0]?.id ?? null),
  );
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConversation = conversations.find((c) => c.id === selectedId);

  async function loadConversations() {
    try {
      const res = await apiFetch<ListConversationsResponse>("/api/messages/conversations");
      setConversations(res.conversations);
    } catch {}
  }

  async function loadMessages(convId: string) {
    setLoadingMessages(true);
    try {
      const res = await apiFetch<{ messages: DirectMessage[] }>(
        `/api/messages/conversations/${convId}`,
      );
      setMessages(res.messages);
      // Decrement unread count locally
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c)),
      );
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    if (selectedId) {
      void loadMessages(selectedId);
    }
  }, [selectedId]);

  // Polling for updates
  useEffect(() => {
    const interval = setInterval(() => {
      void loadConversations();
      if (selectedId) {
        void loadMessages(selectedId);
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !selectedId || sending) return;

    const bodyText = draft.trim();
    setDraft("");
    setSending(true);

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
      setDraft(bodyText);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid h-[calc(100vh-140px)] min-h-[500px] grid-cols-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm md:grid-cols-12">
      {/* Left Pane: Conversations List */}
      <div className="flex flex-col border-r border-[var(--border)] md:col-span-4 lg:col-span-4">
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
                  onClick={() => setSelectedId(conv.id)}
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
                        {conv.participant.displayName || conv.participant.username}
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
      <div className="flex flex-col md:col-span-8 lg:col-span-8">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
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
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMessages && messages.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--muted)]">
                  Loading chat…
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
                        "flex flex-col " + (isMine ? "items-end" : "items-start")
                      }
                    >
                      <div
                        className={
                          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm " +
                          (isMine
                            ? "bg-[var(--brand)] text-white rounded-br-none"
                            : "bg-[var(--keylime)] text-[var(--foreground)] rounded-bl-none border border-[var(--border)]")
                        }
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
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

            {/* Message Input Box */}
            <form
              onSubmit={(e) => void handleSend(e)}
              className="border-t border-[var(--border)] p-3 flex items-center gap-2 bg-[var(--surface)]"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("placeholder")}
                maxLength={2000}
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                className="grid size-9 place-items-center rounded-xl bg-[var(--brand)] text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-[var(--muted)]">
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
