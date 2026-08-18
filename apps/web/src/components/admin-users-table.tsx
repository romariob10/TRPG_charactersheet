"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  KeyRound,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { AdminUserSummary, SiteRole } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import { formatRelativeDate } from "@/lib/utils";

export function AdminUsersTable({
  initialUsers,
  currentUserRole,
  currentUserId,
  locale,
}: {
  initialUsers: AdminUserSummary[];
  currentUserRole: SiteRole;
  currentUserId: string;
  locale: string;
}) {
  const t = useTranslations("AdminConsole.users");
  const [users, setUsers] = useState<AdminUserSummary[]>(initialUsers);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.siteRole !== roleFilter) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        u.email.toLowerCase().includes(q)
      );
    });
  }, [query, roleFilter, users]);

  async function handleRoleChange(userId: string, newRole: SiteRole) {
    setActionLoadingId(userId);
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role: newRole }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, siteRole: newRole } : u)),
      );
      setFeedback({ type: "success", message: t("roleUpdated") });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || t("roleUpdateFailed"),
      });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRevokeSessions(userId: string, username: string) {
    if (!window.confirm(t("confirmRevoke"))) return;
    setActionLoadingId(userId);
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/users/${userId}/revoke-sessions`, {
        method: "POST",
      });
      setFeedback({ type: "success", message: t("sessionsRevoked") });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Failed to revoke sessions",
      });
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div>
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={
            "mb-4 rounded-xl p-3 text-xs font-semibold sm:text-sm " +
            (feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200")
          }
        >
          {feedback.message}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-xs font-semibold text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
          >
            <option value="all">{t("filterByRole")}</option>
            <option value="admin">Administrator</option>
            <option value="moderator">Moderator</option>
            <option value="user">User</option>
          </select>
        </div>

        <label className="relative block w-full sm:w-64">
          <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] pr-3 pl-8 text-xs outline-none focus:border-[var(--brand)]"
          />
        </label>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2.5 font-bold uppercase">{t("user")}</th>
              <th className="px-3 py-2.5 font-bold uppercase">{t("email")}</th>
              <th className="px-3 py-2.5 font-bold uppercase">{t("role")}</th>
              <th className="px-3 py-2.5 font-bold uppercase">{t("activity")}</th>
              <th className="px-3 py-2.5 font-bold uppercase">{t("joined")}</th>
              <th className="px-3 py-2.5 font-bold uppercase text-right">
                {t("actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((u) => {
                const isSelf = u.id === currentUserId;
                const canManageRoles = currentUserRole === "admin";

                return (
                  <tr key={u.id} className="hover:bg-[var(--keylime)]/20">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/users/${u.username}`}
                          className="font-bold text-[var(--brand)] hover:underline"
                        >
                          {u.displayName ?? `@${u.username}`}
                        </Link>
                        <Link
                          href={`/users/${u.username}`}
                          title="Open public profile"
                          className="text-[var(--muted)] hover:text-[var(--brand)]"
                        >
                          <ExternalLink className="size-3" />
                        </Link>
                      </div>
                      <span className="text-xs text-[var(--muted)]">
                        @{u.username}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-[var(--muted)]">
                      {u.email}
                    </td>
                    <td className="px-3 py-2.5">
                      {canManageRoles ? (
                        <select
                          value={u.siteRole}
                          disabled={actionLoadingId === u.id}
                          onChange={(e) =>
                            handleRoleChange(
                              u.id,
                              e.target.value as SiteRole
                            )
                          }
                          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs font-bold text-[var(--brand)] outline-none focus:border-[var(--brand)]"
                        >
                          <option value="user">User</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Administrator</option>
                        </select>
                      ) : (
                        <span
                          className={
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold " +
                            (u.siteRole === "admin"
                              ? "bg-emerald-100 text-emerald-800"
                              : u.siteRole === "moderator"
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-[var(--surface-subtle)] text-[var(--muted)]")
                          }
                        >
                          <ShieldCheck className="size-3" />
                          {u.siteRole}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--muted)]">
                      <span>{u.postsCount} posts</span> ·{" "}
                      <span>{u.charactersCount} chars</span> ·{" "}
                      <span>{u.templatesCount} systems</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--muted)]">
                      {formatRelativeDate(u.joinedAt, locale)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={actionLoadingId === u.id}
                          onClick={async () => {
                            const reason = window.prompt("Reason for warning / restriction:");
                            if (!reason) return;
                            const action = window.prompt("Action (warn, mute_comments, mute_posts, suspend, ban):", "warn");
                            if (!action) return;
                            try {
                              setActionLoadingId(u.id);
                              await apiFetch(`/api/admin/users/${u.id}/moderate`, {
                                method: "POST",
                                body: JSON.stringify({ action, reason }),
                              });
                              setFeedback({ type: "success", message: `Moderation action "${action}" applied.` });
                            } catch (err: any) {
                              setFeedback({ type: "error", message: err.message || "Failed to moderate user" });
                            } finally {
                              setActionLoadingId(null);
                            }
                          }}
                          title="Moderate user"
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300"
                        >
                          <ShieldCheck className="size-3" />
                          <span className="hidden sm:inline">Moderate</span>
                        </button>

                        {currentUserRole === "admin" && (
                          <button
                            type="button"
                            disabled={actionLoadingId === u.id}
                            onClick={() => handleRevokeSessions(u.id, u.username)}
                            title={t("revokeSessions")}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300"
                          >
                            <KeyRound className="size-3" />
                            <span className="hidden sm:inline">
                              {t("revokeSessions")}
                            </span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-[var(--muted)]"
                >
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
