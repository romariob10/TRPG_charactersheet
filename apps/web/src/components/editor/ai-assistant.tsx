"use client";

import { memo, useCallback, useEffect, useState } from "react";
import {
  type AiAppliedChange,
  type AiProposal,
  type FieldValue,
} from "@mycharacter/contracts";
import { z } from "zod";
import {
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
  CopilotSidebar,
  useRenderTool,
} from "@copilotkit/react-core/v2";
import {
  ArrowLeftRight,
  Check,
  History,
  LoaderCircle,
  MessageSquarePlus,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { aiChangeSchema } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const MIN_CHAT_WIDTH = 360;
const MAX_CHAT_WIDTH = 720;

type AttachmentButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  toolsMenu?: unknown;
  onAddFile?: () => void;
};

function DirectAttachmentButton(originalProps: AttachmentButtonProps) {
  const t = useTranslations("AI");
  const onAddFile = originalProps.onAddFile;
  const buttonProps = { ...originalProps };
  delete buttonProps.toolsMenu;
  delete buttonProps.onAddFile;
  delete buttonProps.onClick;
  const { className, ...props } = buttonProps;

  return (
    <button
      type="button"
      className={cn(
        "ml-1 grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] text-[var(--muted)] hover:bg-[var(--keylime)] disabled:opacity-40",
        className,
      )}
      title={t("attachFile")}
      aria-label={t("attachFile")}
      onClick={(event) => {
        if (onAddFile) {
          onAddFile();
          return;
        }
        const sidebar = event.currentTarget.closest("[data-copilot-sidebar]");
        const fileInput =
          sidebar?.querySelector<HTMLInputElement>('input[type="file"]') ??
          document.querySelector<HTMLInputElement>(
            '[data-copilot-sidebar] input[type="file"]',
          );
        fileInput?.click();
      }}
      {...props}
    >
      <Plus className="size-5" />
    </button>
  );
}

const proposalParameters = z.object({ changes: z.array(aiChangeSchema) });
type ProposalCardStatus =
  "checking" | "pending" | "applying" | "applied" | "conflict" | "rejected";

function parseProposal(result: string): AiProposal | null {
  try {
    const parsed = JSON.parse(result) as { proposal?: AiProposal } | AiProposal;
    return (
      (parsed as { proposal?: AiProposal }).proposal ?? (parsed as AiProposal)
    );
  } catch {
    return null;
  }
}

function editableValue(
  original: FieldValue,
  raw: string | boolean,
): FieldValue {
  if (typeof original === "boolean") return Boolean(raw);
  if (Array.isArray(original))
    return String(raw)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  return String(raw);
}

function ProposalCard({
  characterId,
  proposal,
  onBeforeApply,
  onFieldsApplied,
}: {
  characterId: string;
  proposal: AiProposal;
  onBeforeApply: () => Promise<void>;
  onFieldsApplied: (changes: AiAppliedChange[]) => void;
}) {
  const t = useTranslations("AI");
  const [selected, setSelected] = useState(
    () => new Set(proposal.items.map((item) => item.id)),
  );
  const [values, setValues] = useState(
    () => new Map(proposal.items.map((item) => [item.id, item.newValue])),
  );
  const [status, setStatus] = useState<ProposalCardStatus>(() => {
    if (proposal.status === "applied") return "applied";
    if (proposal.status === "rejected") return "rejected";
    if (proposal.status === "expired") return "conflict";
    return "checking";
  });

  useEffect(() => {
    if (proposal.status !== "pending") return;
    const controller = new AbortController();
    void fetch(`/api/ai/proposals/${proposal.id}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Proposal status request failed");
        const result = (await response.json()) as {
          status?: AiProposal["status"];
        };
        setStatus(
          result.status === "applied"
            ? "applied"
            : result.status === "rejected"
              ? "rejected"
              : result.status === "expired"
                ? "conflict"
                : "pending",
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setStatus("pending");
      });
    return () => controller.abort();
  }, [proposal.id, proposal.status]);

  async function apply() {
    setStatus("applying");
    try {
      await onBeforeApply();
      const response = await fetch(
        `/api/characters/${characterId}/field-batches`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalId: proposal.id,
            items: proposal.items
              .filter((item) => selected.has(item.id))
              .map((item) => ({
                itemId: item.id,
                value: values.get(item.id) ?? null,
              })),
          }),
        },
      );
      if (!response.ok) return setStatus("conflict");
      const result = (await response.json()) as {
        applied?: AiAppliedChange[];
        conflicts?: unknown[];
      };
      const applied = result.applied ?? [];
      if (applied.length > 0) onFieldsApplied(applied);
      setStatus(
        result.conflicts?.length || applied.length !== selected.size
          ? "conflict"
          : "applied",
      );
    } catch {
      setStatus("conflict");
    }
  }

  async function reject() {
    const response = await fetch(`/api/ai/proposals/${proposal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    setStatus(response.ok ? "rejected" : "conflict");
  }

  return (
    <div className="my-3 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--keylime)] px-4 py-3">
        <Sparkles className="size-4 text-[var(--brand)]" />
        <strong className="text-sm">{t("changes")}</strong>
      </div>
      <div className="divide-y">
        {proposal.items.map((item) => {
          const value = values.get(item.id) ?? null;
          return (
            <label key={item.id} className="flex gap-3 p-4">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--brand)]"
                checked={selected.has(item.id)}
                disabled={status !== "pending"}
                onChange={(event) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    return next;
                  })
                }
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <strong className="text-sm">{item.label}</strong>
                  <span className="text-xs text-[var(--muted)]">
                    {Math.round(item.confidence * 100)}%
                  </span>
                </span>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  {item.reason}
                </span>
                {typeof value === "boolean" ? (
                  <input
                    className="mt-2 size-4 accent-[var(--brand)]"
                    type="checkbox"
                    checked={value}
                    disabled={status !== "pending"}
                    onChange={(event) =>
                      setValues((current) =>
                        new Map(current).set(item.id, event.target.checked),
                      )
                    }
                  />
                ) : (
                  <input
                    className="mt-2 h-9 w-full rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm outline-none focus-visible:border-[var(--brand)]"
                    value={
                      Array.isArray(value)
                        ? value.join(", ")
                        : String(value ?? "")
                    }
                    disabled={status !== "pending"}
                    onChange={(event) =>
                      setValues((current) =>
                        new Map(current).set(
                          item.id,
                          editableValue(item.newValue, event.target.value),
                        ),
                      )
                    }
                  />
                )}
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 border-t p-3">
        {status === "pending" && (
          <>
            <Button size="sm" variant="ghost" onClick={() => void reject()}>
              <X className="size-4" />
              {t("reject")}
            </Button>
            <Button
              size="sm"
              disabled={!selected.size}
              onClick={() => void apply()}
            >
              <Check className="size-4" />
              {t("apply")}
            </Button>
          </>
        )}
        {status === "checking" && (
          <span className="text-sm text-[var(--muted)]">
            {t("checkingProposal")}
          </span>
        )}
        {status === "applying" && (
          <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <LoaderCircle className="size-4 animate-spin" />
            {t("applying")}
          </span>
        )}
        {status === "applied" && (
          <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <Check className="size-4" />
            {t("applied")}
          </span>
        )}
        {status === "rejected" && (
          <span className="text-sm text-[var(--muted)]">{t("rejected")}</span>
        )}
        {status === "conflict" && (
          <span className="text-sm text-red-700">{t("conflict")}</span>
        )}
      </div>
    </div>
  );
}

function ProposalRenderer({
  characterId,
  onBeforeApply,
  onFieldsApplied,
}: {
  characterId: string;
  onBeforeApply: () => Promise<void>;
  onFieldsApplied: (changes: AiAppliedChange[]) => void;
}) {
  const t = useTranslations("AI");
  useRenderTool(
    {
      name: "proposeFieldChanges",
      agentId: "character",
      parameters: proposalParameters,
      render: ({ status, result }) => {
        if (status !== "complete")
          return (
            <div className="my-3 flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] p-3 text-sm">
              <LoaderCircle className="size-4 animate-spin" />
              {t("preparing")}
            </div>
          );
        const proposal = parseProposal(result);
        return proposal ? (
          <ProposalCard
            characterId={characterId}
            proposal={proposal}
            onBeforeApply={onBeforeApply}
            onFieldsApplied={onFieldsApplied}
          />
        ) : (
          <div className="my-3 rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700">
            {t("invalidProposal")}
          </div>
        );
      },
    },
    [characterId, onBeforeApply, onFieldsApplied],
  );
  return null;
}

interface AiThreadSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

function AiThreadHistory({
  characterId,
  activeThreadId,
  onClose,
  onNewThread,
  onSelectThread,
  width,
  position,
}: {
  characterId: string;
  activeThreadId: string;
  onClose: () => void;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  width: number;
  position: "left" | "right";
}) {
  const t = useTranslations("AI");
  const locale = useLocale();
  const [threads, setThreads] = useState<AiThreadSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/characters/${characterId}/ai-threads`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("History request failed");
        const result = (await response.json()) as {
          threads?: AiThreadSummary[];
        };
        setThreads(result.threads ?? []);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [characterId]);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div
      className={`fixed inset-y-0 z-[1400] flex h-dvh max-w-full flex-col overflow-hidden bg-[var(--surface)] shadow-[var(--shadow-overlay)] ${
        position === "left" ? "left-0 border-r" : "right-0 border-l"
      }`}
      style={{ width }}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <strong className="text-sm">{t("previousChats")}</strong>
        <button
          type="button"
          className="rounded-[7px] px-2 py-1 text-xl leading-none text-[var(--muted)] hover:bg-[var(--keylime)]"
          aria-label={t("dismiss")}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="p-3">
        <Button
          className="w-full justify-center"
          size="sm"
          onClick={onNewThread}
        >
          <MessageSquarePlus className="size-4" />
          {t("newChat")}
        </Button>
      </div>
      <div className="min-h-0 overflow-y-auto border-t p-2">
        {status === "loading" && (
          <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">
            <LoaderCircle className="mr-2 inline size-4 animate-spin" />
            {t("loadingHistory")}
          </p>
        )}
        {status === "error" && (
          <p className="px-3 py-6 text-center text-sm text-red-700">
            {t("historyError")}
          </p>
        )}
        {status === "ready" && threads.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">
            {t("noChats")}
          </p>
        )}
        {status === "ready" &&
          threads.map((thread) => {
            const active = thread.id === activeThreadId;
            const date = dateFormatter.format(new Date(thread.updatedAt));
            return (
              <button
                type="button"
                key={thread.id}
                className={`mb-1 block w-full rounded-[var(--radius-control)] px-3 py-2.5 text-left transition-colors ${active ? "bg-[var(--keylime)] text-[var(--brand)]" : "hover:bg-[var(--keylime)]/55"}`}
                onClick={() => onSelectThread(thread.id)}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {thread.title ?? t("conversationFallback", { date })}
                  </span>
                  {active && (
                    <span className="shrink-0 rounded-full bg-[var(--brand)] px-2 py-0.5 text-[10px] font-semibold text-white">
                      {t("currentChat")}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  {date}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}

const AiAssistantSurface = memo(function AiAssistantSurface({
  characterId,
  userId,
  onBeforeApply,
  onFieldsApplied,
}: {
  characterId: string;
  userId: string;
  onBeforeApply: () => Promise<void>;
  onFieldsApplied: (changes: AiAppliedChange[]) => void;
}) {
  const t = useTranslations("AI");
  const createThreadId = () =>
    `${characterId}:${userId}:${crypto.randomUUID()}`;
  const [thread, setThread] = useState(() => ({
    id: createThreadId(),
    explicit: false,
  }));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(() => {
    if (typeof window === "undefined") return 420;
    const saved = Number(window.localStorage.getItem("mycharacter:chat-width"));
    return Number.isFinite(saved)
      ? Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, saved))
      : 420;
  });
  const [chatPosition, setChatPosition] = useState<"left" | "right">(() => {
    if (typeof window === "undefined") return "right";
    const saved = window.localStorage.getItem("mycharacter:chat-position");
    return saved === "left" || saved === "right" ? saved : "right";
  });
  const [capability, setCapability] = useState<{
    status: "checking" | "enabled" | "disabled";
    diagnostic?: string;
  }>({ status: "checking" });
  const [capabilityAttempt, setCapabilityAttempt] = useState(0);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const resizeChat = useCallback((nextWidth: number) => {
    const width = Math.min(
      Math.min(MAX_CHAT_WIDTH, window.innerWidth),
      Math.max(MIN_CHAT_WIDTH, nextWidth),
    );
    setChatWidth(width);
    window.localStorage.setItem("mycharacter:chat-width", String(width));
  }, []);
  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    document.documentElement.classList.add("ai-sidebar-resizing");
  };
  const handleResizePointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    resizeChat(
      chatPosition === "right"
        ? window.innerWidth - event.clientX
        : event.clientX,
    );
  };
  const finishResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.documentElement.classList.remove("ai-sidebar-resizing");
  };
  const swapChatSide = () => {
    setChatPosition((current) => {
      const next = current === "right" ? "left" : "right";
      window.localStorage.setItem("mycharacter:chat-position", next);
      return next;
    });
    setHistoryOpen(false);
  };
  useEffect(() => {
    let active = true;
    void fetch("/api/ai/capabilities")
      .then(async (response) => {
        const result = (await response.json()) as {
          toolCalls?: boolean;
          diagnostic?: string;
        };
        if (active)
          setCapability(
            result.toolCalls
              ? { status: "enabled" }
              : { status: "disabled", diagnostic: result.diagnostic },
          );
      })
      .catch((error: unknown) => {
        if (active)
          setCapability({
            status: "disabled",
            diagnostic:
              error instanceof Error
                ? error.message
                : "Capability check failed",
          });
      });
    return () => {
      active = false;
    };
  }, [capabilityAttempt]);

  if (capability.status !== "enabled") {
    const message =
      capability.status === "checking"
        ? t("checking")
        : t("unavailable", {
            diagnostic: capability.diagnostic ?? "tool calls are not supported",
          });
    return (
      <div className="fixed right-4 bottom-4 z-50 max-w-sm rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)] shadow-[var(--shadow-overlay)]">
        <p>{message}</p>
        {capability.status === "disabled" && (
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            onClick={() => {
              setCapability({ status: "checking" });
              setCapabilityAttempt((value) => value + 1);
            }}
          >
            {t("retry")}
          </Button>
        )}
      </div>
    );
  }
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      useSingleEndpoint
      headers={{ "x-character-id": characterId }}
      showDevConsole={false}
    >
      <ProposalRenderer
        characterId={characterId}
        onBeforeApply={onBeforeApply}
        onFieldsApplied={onFieldsApplied}
      />
      {historyOpen && (
        <AiThreadHistory
          characterId={characterId}
          activeThreadId={thread.id}
          onClose={() => setHistoryOpen(false)}
          onNewThread={() => {
            setThread({ id: createThreadId(), explicit: false });
            setHistoryOpen(false);
          }}
          onSelectThread={(selectedThreadId) => {
            setThread({ id: selectedThreadId, explicit: true });
            setHistoryOpen(false);
          }}
          width={chatWidth}
          position={chatPosition}
        />
      )}
      {attachmentError && (
        <div className="fixed right-4 bottom-4 z-[1300] max-w-sm rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-[var(--shadow-overlay)]">
          <div className="flex items-start gap-3">
            <span>{attachmentError}</span>
            <button
              type="button"
              aria-label={t("dismiss")}
              onClick={() => setAttachmentError(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}
      <CopilotChatConfigurationProvider
        agentId="character"
        threadId={thread.id}
        hasExplicitThreadId={thread.explicit}
      >
        <CopilotSidebar
          position={chatPosition}
          width={`min(${chatWidth}px, 100vw)`}
          header={{
            children: ({
              titleContent,
              closeButton,
            }: {
              titleContent: React.ReactElement;
              closeButton: React.ReactElement;
            }) => (
              <header className="flex h-16 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4">
                <div
                  role="separator"
                  aria-label={t("resizeChat")}
                  aria-orientation="vertical"
                  aria-valuemin={MIN_CHAT_WIDTH}
                  aria-valuemax={MAX_CHAT_WIDTH}
                  aria-valuenow={chatWidth}
                  tabIndex={0}
                  className={cn(
                    "group absolute inset-y-0 z-20 w-3 cursor-col-resize touch-none",
                    chatPosition === "right" ? "-left-1.5" : "-right-1.5",
                  )}
                  onPointerDown={handleResizePointerDown}
                  onPointerMove={handleResizePointerMove}
                  onPointerUp={finishResize}
                  onPointerCancel={finishResize}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                      return;
                    event.preventDefault();
                    const direction = event.key === "ArrowRight" ? 1 : -1;
                    resizeChat(
                      chatWidth +
                        direction * (chatPosition === "right" ? -20 : 20),
                    );
                  }}
                >
                  <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/10 group-hover:w-0.5 group-hover:bg-[var(--brand)] group-focus-visible:w-0.5 group-focus-visible:bg-[var(--brand)]" />
                </div>
                <div className="min-w-0 flex-1">{titleContent}</div>
                <div className="ml-auto flex shrink-0 items-center gap-0.5 border-l pl-1">
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-[7px] text-[var(--muted)] hover:bg-[var(--keylime)]"
                    title={t("swapSide")}
                    aria-label={t("swapSide")}
                    onClick={swapChatSide}
                  >
                    <ArrowLeftRight className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-[7px] text-[var(--muted)] hover:bg-[var(--keylime)]"
                    title={t("history")}
                    aria-label={t("history")}
                    onClick={() => setHistoryOpen((value) => !value)}
                  >
                    <History className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-[7px] text-[var(--muted)] hover:bg-[var(--keylime)]"
                    title={t("newChat")}
                    aria-label={t("newChat")}
                    onClick={() => {
                      setThread({ id: createThreadId(), explicit: false });
                      setHistoryOpen(false);
                    }}
                  >
                    <MessageSquarePlus className="size-4" />
                  </button>
                  {closeButton}
                </div>
              </header>
            ),
          }}
          attachments={{
            enabled: true,
            accept:
              "image/png,image/jpeg,image/webp,application/pdf,text/*,application/json,application/xml,.md,.csv,.xml",
            maxSize: 4 * 1024 * 1024,
            onUploadFailed: ({ message }: { message: string }) =>
              setAttachmentError(message),
          }}
          input={{ addMenuButton: DirectAttachmentButton }}
          labels={{
            modalHeaderTitle: t("title"),
            welcomeMessageText: t("welcome"),
          }}
        />
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
});

export function AiAssistant({
  characterId,
  userId,
  children,
  onBeforeApply,
  onFieldsApplied,
}: {
  characterId: string;
  userId: string;
  children: React.ReactNode;
  onBeforeApply: () => Promise<void>;
  onFieldsApplied: (changes: AiAppliedChange[]) => void;
}) {
  return (
    <>
      {children}
      <AiAssistantSurface
        characterId={characterId}
        userId={userId}
        onBeforeApply={onBeforeApply}
        onFieldsApplied={onFieldsApplied}
      />
    </>
  );
}
