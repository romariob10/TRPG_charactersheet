"use client";

import { useId, useRef, useState } from "react";
import {
  FileUp,
  Globe2,
  Library,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function TemplateUploadForm() {
  const t = useTranslations("Systems");
  const router = useRouter();
  const fileInputId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const forceDuplicateRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{
    id: string;
    title: string;
    gameSystem: string | null;
    pageCount: number;
    subscribed: boolean;
  } | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  function selectFile(candidate: File | null) {
    setDuplicate(null);
    setError(null);

    if (!candidate) {
      setFile(null);
      return;
    }

    const isPdf =
      candidate.type === "application/pdf" ||
      candidate.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setFile(null);
      setError(t("invalidPdf"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setFile(candidate);
  }

  async function submit(formData: FormData) {
    if (!file) {
      setError(t("selectFile"));
      return;
    }
    setPending(true);
    setError(null);
    setDuplicate(null);
    formData.set("file", file);
    if (forceDuplicateRef.current) formData.set("forceDuplicate", "true");
    forceDuplicateRef.current = false;
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        templateId?: string;
        restored?: boolean;
        duplicateCommunity?: {
          id: string;
          title: string;
          gameSystem: string | null;
          pageCount: number;
          subscribed: boolean;
        };
        error?: string | { code?: string; message?: string; requestId?: string };
      };
      if (response.status === 409 && result.duplicateCommunity) {
        setDuplicate(result.duplicateCommunity);
        setPending(false);
        return;
      }
      if (!response.ok || !result.templateId) {
        throw new Error(uploadErrorMessage(result.error));
      }
      router.push(`/dashboard/systems/${result.templateId}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : uploadErrorMessage(undefined),
      );
      setPending(false);
    }
  }

  function uploadErrorMessage(
    error:
      | string
      | { code?: string; message?: string; requestId?: string }
      | undefined,
  ): string {
    if (typeof error === "string") return error || t("uploadFailed");
    const code = error?.code;
    if (code && t.has(`uploadErrors.${code}`)) {
      return t(`uploadErrors.${code}`);
    }
    if (error?.requestId) {
      return t("uploadFailedWithRequestId", { requestId: error.requestId });
    }
    return error?.message || t("uploadFailed");
  }

  async function subscribeToDuplicate() {
    if (!duplicate) return;
    if (duplicate.subscribed) {
      router.push("/dashboard/systems");
      return;
    }
    setSubscribing(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/templates/${duplicate.id}/subscription`,
        { method: "POST" },
      );
      if (!response.ok) {
        const result = (await response.json()) as { error?: { message?: string } };
        throw new Error(result.error?.message ?? t("subscribeFailed"));
      }
      router.push("/dashboard/systems");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("subscribeFailed"));
      setSubscribing(false);
    }
  }

  return (
    <form
      ref={formRef}
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget));
      }}
    >
      <label className="block space-y-2 text-sm font-semibold">
        <span>{t("gameSystem")}</span>
        <Input
          name="gameSystem"
          required
          maxLength={160}
          placeholder="Dungeons & Dragons 5e"
        />
      </label>
      <label className="block space-y-2 text-sm font-semibold">
        <span>{t("templateName")}</span>
        <Input
          name="title"
          required
          maxLength={160}
          placeholder={t("templatePlaceholder")}
        />
      </label>
      <div>
        <span className="text-sm font-semibold">{t("pdf")}</span>
        <label
          htmlFor={fileInputId}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            selectFile(event.dataTransfer.files[0] ?? null);
          }}
          className={cn(
            "mt-2 flex w-full cursor-pointer flex-col items-center rounded-[var(--radius-card)] border-2 border-dashed bg-[var(--surface)] px-6 py-10 text-center transition-colors",
            dragging && "border-[var(--brand)] bg-[var(--brand-soft)]",
          )}
        >
          <FileUp className="size-9 text-[var(--brand)]" />
          <strong className="mt-4">{file?.name ?? t("drop")}</strong>
          <span className="mt-2 text-sm text-[var(--muted)]">
            {file
              ? t("megabytes", {
                  size: (file.size / 1024 / 1024).toFixed(1),
                })
              : t("limits")}
          </span>
        </label>
        <input
          ref={fileInputRef}
          id={fileInputId}
          name="file"
          className="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          aria-label={t("pdf")}
          onChange={(event) => {
            selectFile(event.currentTarget.files?.[0] ?? null);
          }}
        />
      </div>
      {duplicate && (
        <section
          role="alert"
          className="rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 p-5 sm:p-6"
        >
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-amber-200 text-amber-900">
              <TriangleAlert className="size-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black tracking-[0.16em] text-amber-900 uppercase">
                {t("duplicateEyebrow")}
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-amber-950">
                {t("duplicateTitle")}
              </h2>
              <p className="mt-3 leading-7 text-amber-950">
                {t("duplicateText", { name: duplicate.title })}
              </p>
              <div className="mt-4 rounded-[var(--radius-control)] border border-amber-300 bg-[var(--surface)] p-4">
                <strong className="block text-lg">{duplicate.title}</strong>
                <span className="mt-1 block text-sm text-[var(--muted)]">
                  {duplicate.gameSystem ?? t("unknownSystem")} ·{" "}
                  {t("pages", { count: duplicate.pageCount })}
                </span>
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => void subscribeToDuplicate()}
                  disabled={subscribing}
                >
                  <Library className="size-4" />
                  {subscribing
                    ? t("subscribing")
                    : duplicate.subscribed
                      ? t("alreadyAdded")
                      : t("addCommunity")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    forceDuplicateRef.current = true;
                    formRef.current?.requestSubmit();
                  }}
                  disabled={pending || subscribing}
                >
                  {t("continueOwn")}
                </Button>
              </div>
              <p className="mt-3 text-xs leading-5 text-amber-800">
                {t("duplicateSyncText")}
              </p>
            </div>
          </div>
        </section>
      )}
      <label className="flex gap-3 rounded-[var(--radius-control)] border border-emerald-200 bg-emerald-50/70 p-4">
        <input
          className="mt-1 size-4 accent-[var(--brand)]"
          name="publishCommunity"
          type="checkbox"
          value="true"
          defaultChecked
        />
        <span>
          <span className="flex items-center gap-2 font-semibold">
            <Globe2 className="size-4 text-[var(--brand)]" />
            {t("publishCommunity")}
          </span>
          <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
            {t("publishCommunityText")}
          </span>
        </span>
      </label>
      <label className="flex gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <input
          className="mt-1 size-4 accent-[var(--brand)]"
          name="allowVision"
          type="checkbox"
          value="true"
        />
        <span>
          <span className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-4 text-[var(--brand)]" />
            {t("vision")}
          </span>
          <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
            {t("visionDisclosure")}
          </span>
        </span>
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={pending || !file}
      >
        {pending ? t("uploading") : t("upload")}
      </Button>
    </form>
  );
}
