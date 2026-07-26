"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, FilePlus2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CuratedTemplate {
  id: string;
  title: string;
  gameSystem: string | null;
  pageCount: number;
  community?: boolean;
}

export function CreateCharacterForm({
  templates = [],
}: {
  templates?: CuratedTemplate[];
}) {
  const t = useTranslations("Create");
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    templates[0]?.id ?? null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      setError(t("enterName"));
      return;
    }
    if (!selectedTemplateId) {
      setError(t("selectTemplate"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/characters/from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          templateId: selectedTemplateId,
          allowVision: false,
        }),
      });
      const result = (await response.json()) as {
        characterId?: string;
        error?: string;
      };
      if (!response.ok || !result.characterId) {
        throw new Error(result.error ?? t("createFailed"));
      }
      router.push(`/characters/${result.characterId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("createFailed"));
      setPending(false);
    }
  }

  return (
    <form action={submit} className="space-y-6">
      <label className="block space-y-2 text-sm font-semibold">
        <span>{t("name")}</span>
        <Input
          name="name"
          required
          maxLength={120}
          placeholder="Arven Nightwind"
        />
      </label>

      <div>
        <span className="text-sm font-semibold">{t("template")}</span>
        {templates.length ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {templates.map((template) => {
              const selected = template.id === selectedTemplateId;
              return (
                <button
                  key={template.id}
                  type="button"
                  disabled={pending}
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={cn(
                    "relative rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
                    selected &&
                      "border-[var(--brand)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand)]",
                  )}
                >
                  <strong className="block pr-7">{template.title}</strong>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {template.gameSystem ?? t("rpg")} · {template.pageCount}
                  </span>
                  {template.community && (
                    <span className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                      <RefreshCw className="size-3.5" />
                      {t("communitySynced")}
                    </span>
                  )}
                  {selected && (
                    <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-[var(--brand)] text-white">
                      <Check className="size-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 rounded-[var(--radius-card)] border border-dashed bg-[var(--surface)] p-6 text-center">
            <FilePlus2 className="mx-auto size-8 text-[var(--brand)]" />
            <p className="mt-3 font-semibold">{t("noTemplates")}</p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              {t("noTemplatesText")}
            </p>
          </div>
        )}
      </div>

      <Link
        href="/dashboard/systems/new"
        className={cn(
          buttonClassName({ variant: "secondary", size: "md" }),
          "w-full",
        )}
      >
        <FilePlus2 className="size-4" />
        {t("createTemplate")}
      </Link>

      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <Button
        className="w-full"
        size="lg"
        disabled={pending || !selectedTemplateId}
      >
        {pending ? t("creating") : t("create")}
      </Button>
    </form>
  );
}
