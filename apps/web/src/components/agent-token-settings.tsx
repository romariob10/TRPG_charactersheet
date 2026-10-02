"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  agentTokenListSchema,
  createdAgentTokenSchema,
  type AgentToken,
} from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import { Button } from "./ui/button";

export function AgentTokenSettings() {
  const t = useTranslations("Agents");
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<unknown>("/api/agent-tokens", { signal: controller.signal })
      .then((body) => {
        if (!controller.signal.aborted)
          setTokens(agentTokenListSchema.parse(body).tokens);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setOrigin(window.location.origin);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    setSecret(null);
    setCopied(false);
    try {
      const result = createdAgentTokenSchema.parse(
        await apiFetch<unknown>("/api/agent-tokens", {
          method: "POST",
          body: JSON.stringify({ name }),
        }),
      );
      setTokens((previous) => [result.metadata, ...previous]);
      setSecret(result.token);
      setName("");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setError(false);
    try {
      await apiFetch(`/api/agent-tokens/${id}`, { method: "DELETE" });
      setTokens((previous) => previous.filter((token) => token.id !== id));
      setSecret(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-6 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-6"
      aria-labelledby="agents-title"
    >
      <h2 id="agents-title" className="text-lg font-bold">
        {t("title")}
      </h2>
      <p className="mt-2 text-sm text-[var(--muted)]">{t("description")}</p>
      <form
        onSubmit={create}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label className="flex-1 text-sm">
          {t("name")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            required
            className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-2"
          />
        </label>
        <Button type="submit" disabled={busy || loading || !name.trim()}>
          {busy ? t("working") : t("create")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          {t("error")}
        </p>
      )}
      {secret && (
        <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
          <p className="text-sm">{t("once")}</p>
          <input
            aria-label={t("token")}
            type="password"
            readOnly
            value={secret}
            className="mt-2 w-full bg-transparent font-mono text-sm"
          />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  .writeText(secret)
                  .then(() => setCopied(true))
                  .catch(() => setError(true));
              }}
            >
              {copied ? t("copied") : t("copy")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSecret(null)}
            >
              {t("dismiss")}
            </Button>
          </div>
        </div>
      )}
      {loading ? (
        <p className="mt-4 text-sm" role="status">
          {t("loading")}
        </p>
      ) : tokens.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--muted)]">{t("empty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)]">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="break-words font-semibold">{token.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {token.prefix}… ·{" "}
                  {t("expires", {
                    date: new Date(token.expiresAt).toLocaleDateString(),
                  })}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void revoke(token.id)}
              >
                {t("revoke")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <details className="mt-5 text-sm">
        <summary className="cursor-pointer font-semibold">{t("setup")}</summary>
        <p className="mt-2 text-[var(--muted)]">{t("setupHelp")}</p>
        <pre className="mt-3 overflow-x-auto rounded-[var(--radius-control)] bg-[var(--surface-subtle)] p-3 text-xs">
          {JSON.stringify(
            {
              mcpServers: {
                mycharacter: {
                  command: "node",
                  args: [
                    "/absolute/path/TRPG_charactersheet/packages/mcp/bin/mycharacter-mcp.js",
                  ],
                  env: {
                    MYCHARACTER_API_URL: origin,
                    MYCHARACTER_TOKEN: "<TOKEN>",
                  },
                },
              },
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}
