"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  Check,
  ChevronDown,
  Download,
  Link2,
  LoaderCircle,
  Minus,
  PanelLeft,
  Plus,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { AiAppliedChange } from "@mycharacter/contracts";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PdfPage } from "@/components/editor/pdf-page";
import { AiAssistant } from "@/components/editor/ai-assistant";
import { InviteEditorModal } from "@/components/editor/invite-editor-modal";
import {
  readResponseBody,
  toApiClientError,
} from "@/lib/api/client";
import { LocalRealtimeClient } from "@/lib/realtime/client";
import type {
  CharacterEditorData,
  FieldMutationResponse,
  FieldValue,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type SaveState = "saved" | "saving" | "offline";

export function CharacterEditor({
  initialCharacter,
}: {
  initialCharacter: CharacterEditorData;
}) {
  const t = useTranslations("Editor");
  const [fields, setFields] = useState(initialCharacter.fields);
  const fieldsRef = useRef(fields);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.15);
  const [multilineFontScale, setMultilineFontScale] = useState(1);
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [remoteCollaborators, setRemoteCollaborators] = useState<
    Map<string, { username?: string; displayName?: string | null }>
  >(() => new Map());
  const timers = useRef(new Map<string, number>());
  const dirty = useRef(new Set<string>());
  const saveChains = useRef(new Map<string, Promise<boolean>>());
  const realtimeRef = useRef<LocalRealtimeClient | null>(null);
  const saveFieldRef = useRef<(fieldId: string) => Promise<boolean>>(
    async () => false,
  );

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    let cancelled = false;
    void import("pdfjs-dist")
      .then(async (pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = "/api/pdf-worker";
        if (!initialCharacter.pdfUrl) throw new Error(t("pdfLoadFailed"));
        const loaded = await pdfjs.getDocument({ url: initialCharacter.pdfUrl })
          .promise;
        if (!cancelled) setPdf(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setPdfError(
            error instanceof Error ? error.message : t("pdfLoadFailed"),
          );
      });
    return () => {
      cancelled = true;
    };
  }, [initialCharacter.pdfUrl, t]);

  const persistField = useCallback(
    async (fieldId: string): Promise<boolean> => {
      const field = fieldsRef.current.find(
        (candidate) => candidate.id === fieldId,
      );
      if (!field || !dirty.current.has(fieldId)) return true;
      if (!navigator.onLine) {
        setSaveState("offline");
        return false;
      }
      dirty.current.delete(fieldId);
      setSaveState("saving");
      const sentValue = field.value;
      try {
        const response = await fetch(
          `/api/characters/${initialCharacter.id}/fields/${fieldId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
              value: sentValue,
              expectedVersion: field.version,
              clientMutationId: crypto.randomUUID(),
            }),
          },
        );
        const body = await readResponseBody(response);
        if (!response.ok) throw toApiClientError(response, body);
        const result = body as FieldMutationResponse;
        setFields((current) => {
          const next = current.map((candidate) =>
            candidate.id === fieldId
              ? {
                  ...candidate,
                  version: result.version,
                  value: dirty.current.has(fieldId)
                    ? candidate.value
                    : result.value,
                  updatedAt: result.updatedAt,
                  updatedBy: result.updatedBy,
                }
              : candidate,
          );
          fieldsRef.current = next;
          return next;
        });
        if (result.overwrittenRemote) setNotice(t("remoteConflict"));
        return true;
      } catch (error) {
        dirty.current.add(fieldId);
        setNotice(error instanceof Error ? error.message : "Save failed");
        setSaveState(navigator.onLine ? "saving" : "offline");
        return false;
      }
    },
    [initialCharacter.id, t],
  );

  const saveField = useCallback(
    (fieldId: string): Promise<boolean> => {
      const previous = saveChains.current.get(fieldId) ?? Promise.resolve(true);
      const next = previous.then(
        () => persistField(fieldId),
        () => persistField(fieldId),
      );
      saveChains.current.set(fieldId, next);
      void next.finally(() => {
        if (saveChains.current.get(fieldId) !== next) return;
        saveChains.current.delete(fieldId);
        if (
          dirty.current.has(fieldId) &&
          navigator.onLine &&
          !timers.current.has(fieldId)
        ) {
          const retry = window.setTimeout(() => {
            timers.current.delete(fieldId);
            void saveFieldRef.current(fieldId);
          }, 1500);
          timers.current.set(fieldId, retry);
          return;
        }
        if (saveChains.current.size === 0 && dirty.current.size === 0)
          setSaveState("saved");
      });
      return next;
    },
    [persistField],
  );
  useEffect(() => {
    saveFieldRef.current = saveField;
  }, [saveField]);

  const updateField = useCallback(
    (fieldId: string, value: FieldValue) => {
      setFields((current) => {
        const next = current.map((field) =>
          field.id === fieldId ? { ...field, value } : field,
        );
        fieldsRef.current = next;
        return next;
      });
      dirty.current.add(fieldId);
      setSaveState(navigator.onLine ? "saving" : "offline");
      const previous = timers.current.get(fieldId);
      if (previous) window.clearTimeout(previous);
      timers.current.set(
        fieldId,
        window.setTimeout(() => {
          timers.current.delete(fieldId);
          void saveField(fieldId);
        }, 500),
      );
    },
    [saveField],
  );

  const flushField = useCallback(
    (fieldId: string) => {
      const timer = timers.current.get(fieldId);
      if (timer) window.clearTimeout(timer);
      timers.current.delete(fieldId);
      void saveField(fieldId);
    },
    [saveField],
  );

  const flushAll = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
      const results = await Promise.all(
        [...dirty.current].map((fieldId) => saveField(fieldId)),
      );
      await Promise.all([...saveChains.current.values()]);
      if (
        results.every(Boolean) &&
        dirty.current.size === 0 &&
        saveChains.current.size === 0
      )
        return;
    }
    throw new Error(t("autosaveFailed"));
  }, [saveField, t]);

  const applyAiChanges = useCallback((changes: AiAppliedChange[]) => {
    const changesByFieldId = new Map(
      changes.map((change) => [change.fieldId, change]),
    );
    for (const change of changes) {
      const timer = timers.current.get(change.fieldId);
      if (timer) window.clearTimeout(timer);
      timers.current.delete(change.fieldId);
      dirty.current.delete(change.fieldId);
    }
    setFields((current) => {
      const next = current.map((field) => {
        const change = changesByFieldId.get(field.id);
        if (!change || change.version < field.version) return field;
        return {
          ...field,
          value: change.value,
          version: change.version,
          updatedAt: new Date().toISOString(),
          updatedBy: change.updatedBy,
        };
      });
      fieldsRef.current = next;
      return next;
    });
    if (dirty.current.size === 0 && saveChains.current.size === 0)
      setSaveState("saved");
  }, []);

  useEffect(() => {
    const flushPending = () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
      for (const fieldId of dirty.current) void saveFieldRef.current(fieldId);
    };
    const warnAboutPendingSave = (event: BeforeUnloadEvent) => {
      if (dirty.current.size === 0 && saveChains.current.size === 0) return;
      flushPending();
      event.preventDefault();
    };
    window.addEventListener("pagehide", flushPending);
    window.addEventListener("beforeunload", warnAboutPendingSave);
    return () => {
      flushPending();
      window.removeEventListener("pagehide", flushPending);
      window.removeEventListener("beforeunload", warnAboutPendingSave);
    };
  }, []);

  useEffect(() => {
    const realtime = new LocalRealtimeClient({
      characterId: initialCharacter.id,
      initialRevision: initialCharacter.revision,
      onPresence: (count) => setOnlineUsers(count || 1),
      onPresenceMembers: (members) => {
        const map = new Map<
          string,
          { username?: string; displayName?: string | null }
        >();
        for (const member of members) {
          if (
            member.userId !== initialCharacter.currentUserId &&
            member.fieldId
          ) {
            map.set(member.fieldId, {
              username: member.username,
              displayName: member.displayName,
            });
          }
        }
        setRemoteCollaborators(map);
      },
      onSnapshot: (snapshot) => {
        setFields((current) => {
          const currentById = new Map(current.map((field) => [field.id, field]));
          const updated = snapshot.fields.map((field) => {
            const local = currentById.get(field.id);
            if (
              local &&
              (dirty.current.has(field.id) || saveChains.current.has(field.id))
            ) {
              return { ...local, version: Math.max(local.version, field.version) };
            }
            return field;
          });
          fieldsRef.current = updated;
          return updated;
        });
      },
      onFieldChanged: (next) => {
        setFields((current) => {
          const updated = current.map((field) => {
            if (field.id !== next.fieldId || next.version <= field.version)
              return field;
            if (
              dirty.current.has(field.id) ||
              saveChains.current.has(field.id)
            ) {
              if (next.updatedBy !== initialCharacter.currentUserId)
                setNotice(t("remoteUpdate"));
              return { ...field, version: next.version };
            }
            return {
              ...field,
              value: next.value,
              version: next.version,
              updatedAt: next.updatedAt,
              updatedBy: next.updatedBy,
            };
          });
          fieldsRef.current = updated;
          return updated;
        });
      },
    });
    realtimeRef.current = realtime;
    realtime.start();
    const onOnline = () => {
      setSaveState("saving");
      for (const id of dirty.current) void saveFieldRef.current(id);
    };
    const onOffline = () => setSaveState("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      realtime.stop();
      if (realtimeRef.current === realtime) realtimeRef.current = null;
    };
  }, [
    initialCharacter.currentUserId,
    initialCharacter.id,
    initialCharacter.revision,
    t,
  ]);

  useEffect(() => {
    realtimeRef.current?.focus(activeFieldId);
  }, [activeFieldId]);

  const values = useMemo(
    () => new Map(fields.map((field) => [field.id, field.value])),
    [fields],
  );
  const filtered = fields.filter((field) =>
    `${field.label} ${field.pdfName} ${field.section ?? ""} ${field.aliases.join(" ")}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  async function download(flattened: boolean) {
    setExporting(true);
    setNotice(null);
    try {
      await flushAll();
      const response = await fetch(
        `/api/characters/${initialCharacter.id}/export?mode=${flattened ? "flattened" : "interactive"}`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw toApiClientError(response, await readResponseBody(response));
      }
      const href = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${initialCharacter.name.replace(/[^\p{L}\p{N}_-]+/gu, "-") || "character"}${flattened ? "-print" : ""}.pdf`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function createInvite() {
    const response = await fetch(
      `/api/characters/${initialCharacter.id}/invites`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays: 7 }),
      },
    );
    const result = (await response.json()) as { token?: string; error?: { message?: string } };
    if (!response.ok || !result.token)
      return setNotice(result.error?.message ?? "Could not create invite");
    await navigator.clipboard.writeText(
      `${window.location.origin}/invites/${result.token}`,
    );
    setNotice(t("inviteCopied"));
  }

  return (
    <AiAssistant
      characterId={initialCharacter.id}
      userId={initialCharacter.currentUserId}
      onBeforeApply={flushAll}
      onFieldsApplied={applyAiChanges}
    >
      <div className="flex h-screen min-w-[780px] flex-col bg-[var(--slate)]/45">
        <header className="z-30 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4">
          <Logo compact />
          <Link href="/dashboard" className="ml-1 max-w-56 truncate font-bold">
            {initialCharacter.name}
          </Link>
          <div className="ml-2 flex items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--keylime)] px-2.5 py-1.5 text-xs text-[var(--brand)]">
            {saveState === "saving" ? (
              <span className="size-2 rounded-full bg-sky-500" />
            ) : saveState === "saved" ? (
              <Check className="size-3.5 text-emerald-700" />
            ) : (
              <span className="size-2 rounded-full bg-amber-500" />
            )}
            {t(saveState)}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <div className="mr-1 flex items-center gap-1.5 rounded-[7px] px-2 py-1.5 text-xs text-[var(--muted)]">
              <Users className="size-4" />
              {onlineUsers}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen((value) => !value)}
              title={t("fields")}
            >
              <PanelLeft className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={t("zoomOut")}
              onClick={() => setZoom((value) => Math.max(0.65, value - 0.1))}
            >
              <Minus className="size-4" />
            </Button>
            <span className="w-11 text-center text-xs">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              title={t("zoomIn")}
              onClick={() => setZoom((value) => Math.min(2, value + 0.1))}
            >
              <Plus className="size-4" />
            </Button>
            <div className="mx-1 h-6 w-px bg-black/10" />
            <Button
              variant="ghost"
              size="icon"
              title={t("textareaFontSmaller")}
              aria-label={t("textareaFontSmaller")}
              disabled={multilineFontScale <= 0.7}
              onClick={() =>
                setMultilineFontScale((value) => Math.max(0.7, value - 0.1))
              }
            >
              <span className="text-xs font-bold">A−</span>
            </Button>
            <span
              className="w-11 text-center text-xs"
              title={t("textareaFontSize")}
            >
              {Math.round(multilineFontScale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              title={t("textareaFontLarger")}
              aria-label={t("textareaFontLarger")}
              disabled={multilineFontScale >= 1.6}
              onClick={() =>
                setMultilineFontScale((value) => Math.min(1.6, value + 0.1))
              }
            >
              <span className="text-base font-bold">A+</span>
            </Button>
            {initialCharacter.role === "owner" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setInviteModalOpen(true)}
              >
                <UserPlus className="size-4" />
                {t("invite")}
              </Button>
            )}
            <details className="relative">
              <summary
                className={cn(
                  "list-none",
                  exporting && "pointer-events-none opacity-60",
                )}
              >
                <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] bg-[var(--brand)] px-3 text-sm font-semibold text-white">
                  <Download className="size-4" />
                  PDF
                  <ChevronDown className="size-3" />
                </span>
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-56 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-overlay)]">
                <button
                  className="w-full rounded-[7px] px-3 py-2 text-left text-sm hover:bg-[var(--keylime)]"
                  onClick={() => void download(false)}
                >
                  {t("interactive")}
                </button>
                <button
                  className="w-full rounded-[7px] px-3 py-2 text-left text-sm hover:bg-[var(--keylime)]"
                  onClick={() => void download(true)}
                >
                  {t("flattened")}
                </button>
              </div>
            </details>
          </div>
        </header>
        {notice && (
          <div className="z-20 flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)}>×</button>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          {sidebarOpen && (
            <aside className="scrollbar-thin z-20 flex w-80 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
              <div className="border-b p-4">
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted)]" />
                  <Input
                    className="pl-9"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("search")}
                  />
                </div>
                <div className="mt-3 text-xs text-[var(--muted)]">
                  {t("fieldsCount", {
                    shown: filtered.length,
                    total: fields.length,
                  })}
                </div>
              </div>
              <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
                {filtered.map((field) => (
                  <button
                    key={field.id}
                    className="w-full rounded-[var(--radius-control)] p-3 text-left transition-colors hover:bg-[var(--keylime)]/70"
                    onClick={() =>
                      document
                        .getElementById(
                          `character-field-widget-${field.widgets[0]?.id}`,
                        )
                        ?.scrollIntoView({
                          behavior: "auto",
                          block: "center",
                          inline: "center",
                        })
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {field.label}
                      </span>
                      <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px]">
                        {Math.round(field.confidence * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-[var(--muted)]">
                      <span>{field.section ?? field.pdfName}</span>
                      <span>{t("page", { page: field.page })}</span>
                    </div>
                  </button>
                ))}
              </div>
            </aside>
          )}
          <main className="scrollbar-thin flex-1 overflow-auto p-6 lg:p-8">
            <div className="mx-auto flex w-fit flex-col gap-8">
              {pdf ? (
                Array.from({ length: pdf.numPages }, (_, index) => (
                  <PdfPage
                    key={index + 1}
                    document={pdf}
                    pageNumber={index + 1}
                    zoom={zoom}
                    multilineFontScale={multilineFontScale}
                    activeFieldId={activeFieldId}
                    remoteCollaboratorsByFieldId={remoteCollaborators}
                    fields={fields}
                    values={values}
                    onFieldChange={updateField}
                    onFieldFocus={setActiveFieldId}
                    onFieldBlur={(fieldId) => {
                      setActiveFieldId((current) =>
                        current === fieldId ? null : current,
                      );
                      flushField(fieldId);
                    }}
                  />
                ))
              ) : pdfError ? (
                <div className="grid h-96 w-[612px] place-items-center rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-10 text-center">
                  <div>
                    <p className="font-semibold">{t("pdfLoadFailed")}</p>
                    <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
                      {pdfError}
                    </p>
                    <Button
                      className="mt-5"
                      variant="secondary"
                      onClick={() => window.location.reload()}
                    >
                      {t("retry")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid h-96 w-[612px] place-items-center rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]">
                  <LoaderCircle className="size-7 animate-spin text-[var(--brand)]" />
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
      <InviteEditorModal
        characterId={initialCharacter.id}
        characterName={initialCharacter.name}
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
      />
    </AiAssistant>
  );
}
