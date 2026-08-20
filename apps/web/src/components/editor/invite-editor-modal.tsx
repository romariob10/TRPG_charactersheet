"use client";

import { useEffect, useState } from "react";
import { Check, Copy, LoaderCircle, Send, UserPlus, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FriendSummary, ListFriendsResponse } from "@mycharacter/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";

export function InviteEditorModal({
  characterId,
  characterName,
  isOpen,
  onClose,
}: {
  characterId: string;
  characterName: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Editor");
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [invitingUsername, setInvitingUsername] = useState(false);
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStatusMessage(null);
      return;
    }
    let cancelled = false;
    setLoadingFriends(true);
    apiFetch<ListFriendsResponse>("/api/friends")
      .then((res) => {
        if (!cancelled) setFriends(res.items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingFriends(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleCopyLink() {
    setCopyingLink(true);
    setStatusMessage(null);
    try {
      const res = await apiFetch<{ token: string }>(`/api/characters/${characterId}/invites`, {
        method: "POST",
      });
      const link = `${window.location.origin}/invites/${res.token}`;
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
      setStatusMessage({ type: "success", text: t("inviteCopied") });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to generate invite link.",
      });
    } finally {
      setCopyingLink(false);
    }
  }

  async function handleInviteByUsername(e: React.FormEvent) {
    e.preventDefault();
    const username = usernameInput.trim();
    if (!username || invitingUsername) return;

    setInvitingUsername(true);
    setStatusMessage(null);
    try {
      await apiFetch(`/api/characters/${characterId}/invite-user`, {
        method: "POST",
        body: JSON.stringify({ username }),
      });
      setUsernameInput("");
      setStatusMessage({ type: "success", text: t("invitedSuccess") });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to invite user.",
      });
    } finally {
      setInvitingUsername(false);
    }
  }

  async function handleInviteFriend(friend: FriendSummary) {
    if (invitingUserId || invitedUserIds.has(friend.id)) return;
    setInvitingUserId(friend.id);
    setStatusMessage(null);
    try {
      await apiFetch(`/api/characters/${characterId}/invite-user`, {
        method: "POST",
        body: JSON.stringify({ userId: friend.id }),
      });
      setInvitedUserIds((prev) => new Set(prev).add(friend.id));
      setStatusMessage({ type: "success", text: t("invitedSuccess") });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to invite friend.",
      });
    } finally {
      setInvitingUserId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
              <UserPlus className="size-5" />
            </div>
            <div>
              <h2 id="invite-modal-title" className="text-base font-bold text-[var(--foreground)]">
                {t("inviteModalTitle")}
              </h2>
              <p className="text-xs text-[var(--muted)] truncate max-w-xs sm:max-w-sm">
                «{characterName}»
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("dismiss") || "Close"}
            className="grid size-8 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--keylime)] hover:text-[var(--foreground)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Subtitle */}
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
          {t("inviteModalSubtitle")}
        </p>

        {/* Status Message */}
        {statusMessage && (
          <div
            role="status"
            className={
              "mt-3.5 flex items-center gap-2 rounded-xl p-3 text-xs font-semibold " +
              (statusMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-800 border border-red-200")
            }
          >
            {statusMessage.type === "success" ? (
              <Check className="size-4 shrink-0 text-emerald-600" />
            ) : null}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Action 1: Copy Link */}
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-xs font-bold text-[var(--foreground)]">
                {t("copyInvite")}
              </span>
              <span className="block text-[11px] text-[var(--muted)]">
                {t("inviteCopied")}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant={copiedLink ? "secondary" : "primary"}
              disabled={copyingLink}
              onClick={() => void handleCopyLink()}
              className="shrink-0 text-xs"
            >
              {copiedLink ? (
                <>
                  <Check className="size-3.5 text-emerald-700" />
                  <span>{t("copyInviteLink")}</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>{t("copyInviteLink")}</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Action 2: Invite by Username */}
        <form onSubmit={(e) => void handleInviteByUsername(e)} className="mt-4">
          <label className="block text-xs font-bold text-[var(--foreground)] mb-1.5">
            {t("inviteByUsername")}
          </label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder={t("inviteUsernamePlaceholder")}
              className="flex-1 text-xs"
              required
            />
            <Button
              type="submit"
              size="sm"
              disabled={!usernameInput.trim() || invitingUsername}
              className="shrink-0 text-xs"
            >
              {invitingUsername ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              <span>{t("inviteButton")}</span>
            </Button>
          </div>
        </form>

        {/* Action 3: Friends List */}
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Users className="size-4 text-[var(--muted)]" />
            <span className="text-xs font-bold text-[var(--foreground)]">
              {t("friendsList")}
            </span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {loadingFriends ? (
              <div className="py-6 text-center text-xs text-[var(--muted)]">
                <LoaderCircle className="inline size-4 animate-spin mr-1.5" />
                <span>{t("loading")}</span>
              </div>
            ) : friends.length === 0 ? (
              <p className="py-4 text-center text-xs text-[var(--muted)]">
                {t("noFriends")}
              </p>
            ) : (
              friends.map((friend) => {
                const isInvited = invitedUserIds.has(friend.id);
                const isInviting = invitingUserId === friend.id;
                return (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-2.5 transition-colors hover:bg-[var(--keylime)]/40"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand)]">
                        {(friend.displayName || friend.username)[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--foreground)] truncate">
                          {friend.displayName || friend.username}
                        </p>
                        <p className="text-[10px] text-[var(--muted)] truncate">
                          @{friend.username}
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant={isInvited ? "ghost" : "secondary"}
                      disabled={isInvited || isInviting}
                      onClick={() => void handleInviteFriend(friend)}
                      className="shrink-0 text-xs h-7 px-2.5"
                    >
                      {isInviting ? (
                        <LoaderCircle className="size-3 animate-spin" />
                      ) : isInvited ? (
                        <>
                          <Check className="size-3 text-emerald-700" />
                          <span>{t("applied")}</span>
                        </>
                      ) : (
                        <span>{t("inviteButton")}</span>
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
