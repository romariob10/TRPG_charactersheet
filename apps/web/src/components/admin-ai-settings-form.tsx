"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, LoaderCircle, PlugZap } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  AiProvider,
  AiSettingsResponse,
  UpdateAiSettingsRequest,
} from "@mycharacter/contracts";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const providerDefaults: Record<
  AiProvider,
  Omit<UpdateAiSettingsRequest, "provider" | "apiKey">
> = {
  qwen: {
    baseUrl:
      "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    chatModel: "qwen3.8-max-preview",
    visionModel: "qwen3.8-max-preview",
    visionSupportsImages: true,
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    chatModel: "gpt-4.1-mini",
    visionModel: "gpt-4.1-mini",
    visionSupportsImages: true,
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    chatModel: "openai/gpt-4.1-mini",
    visionModel: "openai/gpt-4.1-mini",
    visionSupportsImages: true,
  },
  custom: {
    baseUrl: "",
    chatModel: "",
    visionModel: "",
    visionSupportsImages: true,
  },
};

export function AdminAiSettingsForm({
  initial,
}: {
  initial: AiSettingsResponse;
}) {
  const t = useTranslations("AdminAi");
  const [provider, setProvider] = useState(initial.provider);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [chatModel, setChatModel] = useState(initial.chatModel);
  const [visionModel, setVisionModel] = useState(initial.visionModel);
  const [visionSupportsImages, setVisionSupportsImages] = useState(
    initial.visionSupportsImages,
  );
  const [configuredProvider, setConfiguredProvider] = useState(
    initial.configured ? initial.provider : null,
  );
  const [keyHint, setKeyHint] = useState(initial.keyHint);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "success" | "failed"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const keyRequired = configuredProvider !== provider;

  function selectProvider(nextProvider: AiProvider) {
    const defaults = providerDefaults[nextProvider];
    setProvider(nextProvider);
    setBaseUrl(defaults.baseUrl);
    setChatModel(defaults.chatModel);
    setVisionModel(defaults.visionModel);
    setVisionSupportsImages(defaults.visionSupportsImages);
    setApiKey("");
    setStatus("idle");
    setTestStatus("idle");
    setError(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setTestStatus("idle");
    setError(null);
    try {
      const saved = await apiFetch<AiSettingsResponse>(
        "/api/admin/ai-settings",
        {
          method: "PUT",
          body: JSON.stringify({
            provider,
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
            baseUrl,
            chatModel,
            visionModel,
            visionSupportsImages,
          } satisfies UpdateAiSettingsRequest),
        },
      );
      setConfiguredProvider(saved.provider);
      setKeyHint(saved.keyHint);
      setApiKey("");
      setStatus("saved");
    } catch (reason) {
      setStatus("idle");
      setError(
        reason instanceof ApiClientError &&
          reason.code === "AI_API_KEY_REQUIRED"
          ? t("keyRequired")
          : reason instanceof Error
            ? reason.message
            : t("saveFailed"),
      );
    }
  }

  async function testConnection() {
    setTestStatus("testing");
    setError(null);
    try {
      const result = await apiFetch<{
        configured: boolean;
        toolCalls: boolean;
        diagnostic: string | null;
      }>("/api/ai/capabilities");
      if (!result.configured || !result.toolCalls) {
        throw new Error(result.diagnostic ?? t("testFailed"));
      }
      setTestStatus("success");
    } catch (reason) {
      setTestStatus("failed");
      setError(reason instanceof Error ? reason.message : t("testFailed"));
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-bold">{t("provider")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["qwen", "openai", "openrouter", "custom"] as const).map((item) => (
            <label
              key={item}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                provider === item
                  ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                  : "border-[var(--border)] hover:bg-[var(--keylime)]/55"
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={item}
                checked={provider === item}
                onChange={() => selectProvider(item)}
                className="mt-1 accent-[var(--brand)]"
              />
              <span>
                <span className="block text-sm font-bold">
                  {t(`providers.${item}`)}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">
                  {t(`providerHelp.${item}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-2 text-sm font-bold">
        <span className="flex items-center gap-2">
          <KeyRound className="size-4 text-[var(--brand)]" /> {t("apiKey")}
        </span>
        <Input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          required={keyRequired}
          minLength={8}
          maxLength={512}
          autoComplete="new-password"
          placeholder={
            keyHint
              ? t("keyConfigured", { hint: keyHint })
              : t("keyPlaceholder")
          }
        />
        <span className="block text-xs font-normal leading-5 text-[var(--muted)]">
          {keyHint && !keyRequired ? t("keyKeepHint") : t("keyStorageHint")}
        </span>
      </label>

      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
        <summary className="cursor-pointer text-sm font-bold">
          {t("advanced")}
        </summary>
        <div className="mt-4 grid gap-4">
          <label className="space-y-2 text-sm font-semibold">
            <span>{t("baseUrl")}</span>
            <Input
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              required
              placeholder="https://provider.example/v1"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold">
              <span>{t("chatModel")}</span>
              <Input
                value={chatModel}
                onChange={(event) => setChatModel(event.target.value)}
                required
              />
            </label>
            <label className="space-y-2 text-sm font-semibold">
              <span>{t("visionModel")}</span>
              <Input
                value={visionModel}
                onChange={(event) => setVisionModel(event.target.value)}
                required
              />
            </label>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={visionSupportsImages}
              onChange={(event) =>
                setVisionSupportsImages(event.target.checked)
              }
              className="mt-1 accent-[var(--brand)]"
            />
            <span>
              <span className="block font-semibold">{t("visionImages")}</span>
              <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">
                {t("visionImagesHelp")}
              </span>
            </span>
          </label>
        </div>
      </details>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {status === "saved" && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="size-4" /> {t("saved")}
        </p>
      )}
      {testStatus === "success" && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="size-4" /> {t("testSuccess")}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={status === "saving"}>
          {status === "saving" && (
            <LoaderCircle className="size-4 animate-spin" />
          )}
          {status === "saving" ? t("saving") : t("save")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={
            status === "saving" || testStatus === "testing" || keyRequired
          }
          onClick={() => void testConnection()}
        >
          {testStatus === "testing" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <PlugZap className="size-4" />
          )}
          {testStatus === "testing" ? t("testing") : t("test")}
        </Button>
      </div>
    </form>
  );
}
