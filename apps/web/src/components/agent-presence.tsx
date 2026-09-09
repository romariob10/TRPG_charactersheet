"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MousePointer2, Bot } from "lucide-react";
import {
  agentPresenceListSchema,
  type AgentPresence as Presence,
  type AgentResource,
} from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";

export function AgentPresence({
  resourceType,
  resourceId,
  target,
  onSync,
}: AgentResource & {
  target: string;
  onSync?: (signal: AbortSignal) => Promise<void>;
}) {
  const t = useTranslations("Agents");
  const [failed, setFailed] = useState(false);
  const [agents, setAgents] = useState<Presence[]>([]);
  const sync = useRef(onSync);
  useEffect(() => {
    sync.current = onSync;
  }, [onSync]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = agentPresenceListSchema.parse(
          await apiFetch<unknown>(
            `/api/agent-presence?resourceType=${resourceType}&resourceId=${resourceId}`,
            { signal: controller.signal },
          ),
        );
        if (controller.signal.aborted) return;
        setAgents(result.agents);
        setFailed(false);
        await sync.current?.(controller.signal);
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true);
          setAgents([]);
        }
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void poll(), 2_000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [resourceId, resourceType]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 print:hidden"
      data-agent-presence
    >
      <div
        className="absolute right-2 top-2 flex max-w-full flex-wrap justify-end gap-2"
        aria-label={t("online")}
      >
        {failed && (
          <span
            role="status"
            className="rounded bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)]"
          >
            {t("syncError")}
          </span>
        )}
        {agents.map((agent) => (
          <span
            key={agent.id}
            className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs shadow-sm"
          >
            <Bot className="size-3" />
            {agent.name} · {t("agent")}
          </span>
        ))}
      </div>
      {agents
        .filter((agent) => agent.target === target)
        .map((agent) => (
          <div
            key={agent.id}
            style={{ left: `${agent.x * 100}%`, top: `${agent.y * 100}%` }}
            className="absolute text-[var(--brand)]"
          >
            <MousePointer2 className="size-5 fill-current" />
            <span
              className={`absolute top-5 w-max max-w-48 rounded-[var(--radius-control)] bg-[var(--brand)] px-2 py-1 text-xs text-white ${agent.x > 0.5 ? "right-0" : "left-0"}`}
            >
              <span className="block font-semibold">
                {agent.name} · {t("agent")}
              </span>
              {agent.status && (
                <span className="block break-words whitespace-normal">
                  {agent.status}
                </span>
              )}
            </span>
          </div>
        ))}
    </div>
  );
}
