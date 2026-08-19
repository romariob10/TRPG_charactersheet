"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MyProfile } from "@/lib/types";

export function ProfileSettingsForm({ initial }: { initial: MyProfile }) {
  const t = useTranslations("ProfileSettings");
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const usernameChanged = username !== initial.username;

  const [allowComments, setAllowComments] = useState(initial.allowComments ?? true);
  const [showCharacters, setShowCharacters] = useState(initial.showCharacters ?? true);
  const [showTemplates, setShowTemplates] = useState(initial.showTemplates ?? true);
  const [showActivity, setShowActivity] = useState(initial.showActivity ?? true);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacySaved, setPrivacySaved] = useState(false);

  async function savePrivacy(updated: {
    allowComments?: boolean;
    showCharacters?: boolean;
    showTemplates?: boolean;
    showActivity?: boolean;
  }) {
    setPrivacySaving(true);
    setPrivacySaved(false);
    try {
      await apiFetch("/api/profiles/privacy", {
        method: "PUT",
        body: JSON.stringify(updated),
      });
      setPrivacySaved(true);
      setTimeout(() => setPrivacySaved(false), 3000);
    } finally {
      setPrivacySaving(false);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      await apiFetch<MyProfile>("/api/profiles/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          username,
          bio,
        }),
      });
      setStatus("saved");
    } catch (reason) {
      setStatus("idle");
      if (reason instanceof ApiClientError && reason.code === "USERNAME_TAKEN") {
        setError(t("usernameTaken"));
      } else if (
        reason instanceof ApiClientError &&
        reason.code === "VALIDATION_FAILED"
      ) {
        setError(t("validationFailed"));
      } else {
        setError(reason instanceof Error ? reason.message : t("saveFailed"));
      }
    }
  }

  return (
    <div className="space-y-10">
      <form onSubmit={(event) => void save(event)} className="space-y-5">
        <label className="block space-y-2 text-sm font-semibold">
          <span>{t("displayName")}</span>
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={80}
            placeholder={t("displayNamePlaceholder")}
          />
        </label>

        <div className="space-y-2 text-sm font-semibold">
          <label className="block space-y-2">
            <span>{t("username")}</span>
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              required
              maxLength={30}
              pattern="[a-z0-9][a-z0-9_-]{2,29}"
              autoComplete="off"
            />
          </label>
          <p className="text-sm font-normal text-[var(--muted)]">
            {t("usernameRules")}
          </p>
          <p className="text-sm font-normal text-[var(--muted)]">
            {t("urlHint", { url: `/users/${username || "…"}` })}
          </p>
          {usernameChanged && (
            <p
              role="note"
              className="rounded-[var(--radius-control)] bg-amber-50 p-3 text-sm font-normal text-amber-900"
            >
              {t("usernameChangeWarning")}
            </p>
          )}
        </div>

        <label className="block space-y-2 text-sm font-semibold">
          <span>{t("bio")}</span>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={500}
            rows={4}
            placeholder={t("bioPlaceholder")}
            className="w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {status === "saved" && (
          <p
            role="status"
            className="rounded-[var(--radius-control)] bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            {t("saved")}
          </p>
        )}

        <Button type="submit" disabled={status === "saving"}>
          {status === "saving" ? t("saving") : t("save")}
        </Button>
      </form>

      {/* Privacy and Visibility Section */}
      <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="border-b border-[var(--border)] pb-3">
          <h2 className="text-base font-bold text-[var(--foreground)]">
            {t("privacyTitle")}
          </h2>
        </div>

        <div className="space-y-4 pt-1">
          {/* Allow comments */}
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div>
              <span className="text-sm font-semibold text-[var(--foreground)]">
                {t("allowCommentsLabel")}
              </span>
              <p className="text-xs text-[var(--muted)]">
                {t("allowCommentsDesc")}
              </p>
            </div>
            <input
              type="checkbox"
              checked={allowComments}
              disabled={privacySaving}
              onChange={(e) => {
                const next = e.target.checked;
                setAllowComments(next);
                void savePrivacy({ allowComments: next });
              }}
              className="mt-0.5 size-4.5 rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)]"
            />
          </label>

          {/* Show characters */}
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div>
              <span className="text-sm font-semibold text-[var(--foreground)]">
                {t("showCharactersLabel")}
              </span>
              <p className="text-xs text-[var(--muted)]">
                {t("showCharactersDesc")}
              </p>
            </div>
            <input
              type="checkbox"
              checked={showCharacters}
              disabled={privacySaving}
              onChange={(e) => {
                const next = e.target.checked;
                setShowCharacters(next);
                void savePrivacy({ showCharacters: next });
              }}
              className="mt-0.5 size-4.5 rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)]"
            />
          </label>

          {/* Show templates */}
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div>
              <span className="text-sm font-semibold text-[var(--foreground)]">
                {t("showTemplatesLabel")}
              </span>
              <p className="text-xs text-[var(--muted)]">
                {t("showTemplatesDesc")}
              </p>
            </div>
            <input
              type="checkbox"
              checked={showTemplates}
              disabled={privacySaving}
              onChange={(e) => {
                const next = e.target.checked;
                setShowTemplates(next);
                void savePrivacy({ showTemplates: next });
              }}
              className="mt-0.5 size-4.5 rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)]"
            />
          </label>

          {/* Show activity */}
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div>
              <span className="text-sm font-semibold text-[var(--foreground)]">
                {t("showActivityLabel")}
              </span>
              <p className="text-xs text-[var(--muted)]">
                {t("showActivityDesc")}
              </p>
            </div>
            <input
              type="checkbox"
              checked={showActivity}
              disabled={privacySaving}
              onChange={(e) => {
                const next = e.target.checked;
                setShowActivity(next);
                void savePrivacy({ showActivity: next });
              }}
              className="mt-0.5 size-4.5 rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)]"
            />
          </label>
        </div>

        {privacySaved && (
          <p className="text-xs font-semibold text-emerald-700">
            {t("privacySaved")}
          </p>
        )}
      </div>
    </div>
  );
}
