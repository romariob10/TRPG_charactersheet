"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, Check, FilePlus2, FileText, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export type CharacterCreationSource =
  | {
      type: "sheet";
      group: "mine" | "saved" | "official";
      id: string;
      sheetVersionId: string;
      systemId: string;
      title: string;
      systemTitle: string;
      sheetTitle: string;
      versionNumber: number;
    }
  | {
      type: "template";
      group: "mine" | "saved" | "official";
      id: string;
      templateId: string;
      title: string;
      systemTitle: string;
      pageCount: number;
      community?: boolean;
    };

interface CreateCharacterFormProps {
  sources?: CharacterCreationSource[];
  templates?: Array<{
    id: string;
    title: string;
    pageCount: number;
    gameSystem?: string | null;
    community?: boolean;
  }>;
  publishedSheets?: Array<{
    id: string;
    sheetDefinitionId: string;
    sheetTitle: string;
    systemId: string;
    systemTitle: string;
    versionNumber: number;
    kind: "standard" | "compact" | "npc" | "spellbook" | "vehicle";
  }>;
  initialSelectedId?: string;
}

export function CreateCharacterForm({
  sources,
  templates = [],
  publishedSheets = [],
  initialSelectedId,
}: CreateCharacterFormProps) {
  const t = useTranslations("Create");
  const router = useRouter();

  const effectiveSources: CharacterCreationSource[] =
    sources ?? [
      ...(publishedSheets?.map((s) => ({
        type: "sheet" as const,
        group: "mine" as const,
        id: s.id,
        sheetVersionId: s.id,
        sheetTitle: s.sheetTitle,
        title: s.sheetTitle,
        systemId: s.systemId,
        systemTitle: s.systemTitle,
        versionNumber: s.versionNumber,
      })) ?? []),
      ...(templates?.map((tpl) => ({
        type: "template" as const,
        group: tpl.community ? ("saved" as const) : ("mine" as const),
        id: tpl.id,
        templateId: tpl.id,
        title: tpl.title,
        systemTitle: tpl.gameSystem ?? "PDF Template",
        pageCount: tpl.pageCount,
        community: tpl.community,
      })) ?? []),
    ];

  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId || effectiveSources[0]?.id || null,
  );
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const selectedSource = effectiveSources.find((s) => s.id === selectedId);
  const sourceGroups = ["mine", "saved", "official"] as const;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current || pending) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("enterName"));
      return;
    }
    if (!selectedSource) {
      setError(t("selectTemplate"));
      return;
    }

    submittingRef.current = true;
    setPending(true);
    setError(null);

    try {
      const payload =
        selectedSource.type === "sheet"
          ? {
              name: trimmedName,
              sheetVersionId: selectedSource.sheetVersionId,
              systemId: selectedSource.systemId,
            }
          : {
              name: trimmedName,
              templateId: selectedSource.templateId,
            };

      const result = await apiFetch<{ id: string }>("/api/characters", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (result?.id) {
        router.push(`/characters/${result.id}`);
      } else {
        throw new Error("No character ID returned.");
      }
    } catch (reason: unknown) {
      submittingRef.current = false;
      setError(
        reason instanceof Error
          ? reason.message
          : t("createFailed"),
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="character-name" className="block text-sm font-semibold text-[var(--foreground)]">
          {t("name")} *
        </label>
        <Input
          id="character-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          disabled={pending}
          className="mt-2 text-base"
        />
      </div>

      <div>
        <span className="block text-sm font-semibold text-[var(--foreground)]">
          {t("template")} *
        </span>
        {effectiveSources.length ? (
          <div className="mt-2.5 space-y-4">
            {sourceGroups.map((group) => {
              const groupedSources = effectiveSources.filter(
                (source) => source.group === group,
              );
              if (groupedSources.length === 0) return null;
              return (
                <section
                  key={group}
                  aria-labelledby={`source-group-${group}`}
                  data-source-group={group}
                  className={cn(
                    "rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5 sm:p-4",
                    group === "official" && "border-[var(--brand)]/25",
                  )}
                >
                  <h3
                    id={`source-group-${group}`}
                    className={cn(
                      "mb-3 text-xs font-bold tracking-wide text-[var(--muted)] uppercase",
                      group === "official" && "text-[var(--brand)]",
                    )}
                  >
                    {t(`sourceGroup.${group}`)}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {groupedSources.map((source) => {
                      const isSelected = source.id === selectedId;
                      return (
                        <button
                          key={source.id}
                          type="button"
                          disabled={pending}
                          onClick={() => setSelectedId(source.id)}
                          className={cn(
                            "relative flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
                            isSelected
                              ? "border-[var(--brand)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand)]"
                              : "hover:border-[var(--brand)]/30",
                          )}
                        >
                          <div className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--surface-strong)] text-[var(--brand)]">
                            {source.type === "sheet" ? (
                              <BookOpen className="size-4" />
                            ) : (
                              <FileText className="size-4" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 pr-6">
                            <strong className="block truncate text-sm font-bold text-[var(--foreground)]">
                              {source.type === "sheet" ? source.sheetTitle : source.title}
                            </strong>
                            <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                              {source.systemTitle}
                              {source.type === "sheet"
                                ? ` · v${source.versionNumber}`
                                : ` · ${t("pages", { count: source.pageCount })}`}
                            </span>
                            {source.type === "template" && source.community && (
                              <span className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
                                <RefreshCw className="size-3" />
                                {t("communitySynced")}
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-[var(--brand)] text-white">
                              <Check className="size-3.5" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 rounded-[var(--radius-card)] border border-dashed bg-[var(--surface-subtle)] p-6 text-center">
            <FilePlus2 className="mx-auto size-8 text-[var(--brand)]" />
            <p className="mt-3 font-semibold text-sm">{t("noTemplates")}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {t("noTemplatesText")}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
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
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-control)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]"
        >
          {error}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={pending || !selectedId || !name.trim()}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2" />
            {t("creating")}
          </>
        ) : (
          t("create")
        )}
      </Button>
    </form>
  );
}
