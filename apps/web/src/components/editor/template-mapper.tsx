"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Globe2,
  Lock,
  Minus,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { TemplatePdfPage } from "@/components/editor/template-pdf-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TemplateEditorData, TemplateField } from "@/lib/types";
import { cn } from "@/lib/utils";

function FieldInspector({
  templateId,
  field,
  onSaved,
}: {
  templateId: string;
  field: TemplateField;
  onSaved: (field: TemplateField) => void;
}) {
  const t = useTranslations("Systems");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const payload = {
      label: String(formData.get("label") ?? "").trim(),
      section: String(formData.get("section") ?? "").trim() || null,
      aliases: String(formData.get("aliases") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      groupId: field.groupId,
      groupOrder: field.groupOrder,
      enabled: formData.get("enabled") === "on",
    };
    try {
      const response = await fetch(
        `/api/templates/${templateId}/fields/${field.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as {
        field?: {
          label: string;
          aliases: string[];
          section: string | null;
          groupId: string | null;
          groupOrder: number | null;
          enabled: boolean;
        };
        error?: { message?: string };
      };
      if (!response.ok || !result.field) {
        throw new Error(result.error?.message ?? t("saveFailed"));
      }
      onSaved({
        ...field,
        ...result.field,
        confidence: 1,
        source: "manual",
      });
      setPending(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("saveFailed"));
      setPending(false);
    }
  }

  return (
    <form action={submit} className="flex h-full flex-col">
      <div className="border-b p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-[7px] bg-[var(--keylime)] px-2 py-1 text-xs font-semibold">
            {t("page", { page: field.page })}
          </span>
          <span className="rounded-[7px] bg-[var(--slate)]/35 px-2 py-1 text-xs font-semibold text-[var(--info)]">
            {field.kind}
          </span>
        </div>
        <dl className="mt-4 space-y-3 text-xs">
          <div>
            <dt className="font-semibold text-[var(--muted)]">
              {t("technicalName")}
            </dt>
            <dd className="mt-1 break-all rounded-[7px] bg-[var(--keylime)]/55 px-2.5 py-2 font-mono">
              {field.pdfName}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="font-semibold text-[var(--muted)]">
              {t("fieldType")}
            </dt>
            <dd>{field.kind}</dd>
          </div>
        </dl>
      </div>

      <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-5">
        <label className="block space-y-2 text-sm font-semibold">
          <span>{t("fieldLabel")}</span>
          <Input
            name="label"
            defaultValue={field.label}
            required
            maxLength={240}
          />
        </label>
        <label className="block space-y-2 text-sm font-semibold">
          <span>{t("section")}</span>
          <Input
            name="section"
            defaultValue={field.section ?? ""}
            maxLength={240}
          />
        </label>
        <label className="block space-y-2 text-sm font-semibold">
          <span>{t("aliases")}</span>
          <Input name="aliases" defaultValue={field.aliases.join(", ")} />
        </label>
        <label className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-4">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={field.enabled}
            className="mt-1 size-4 accent-[var(--brand)]"
          />
          <span>
            <strong className="block text-sm">{t("enabled")}</strong>
            <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
              {t("enabledText")}
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
      </div>
      <div className="border-t p-5">
        <Button className="w-full" disabled={pending}>
          {pending ? t("savingField") : t("saveField")}
        </Button>
      </div>
    </form>
  );
}

interface TemplateSettingsValue {
  title: string;
  gameSystem: string;
  isPublic: boolean;
}

function TemplateSettingsDialog({
  templateId,
  value,
  onClose,
  onUpdated,
}: {
  templateId: string;
  value: TemplateSettingsValue;
  onClose: () => void;
  onUpdated: (value: TemplateSettingsValue) => void;
}) {
  const t = useTranslations("Systems");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(formData.get("title") ?? "").trim(),
          gameSystem: String(formData.get("gameSystem") ?? "").trim(),
          isPublic: formData.get("isPublic") === "on",
        }),
      });
      const result = (await response.json()) as {
        title?: string;
        gameSystem?: string | null;
        isPublic?: boolean;
        error?: { message?: string };
      };
      if (
        !response.ok ||
        !result.title ||
        result.isPublic === undefined
      ) {
        throw new Error(result.error?.message ?? t("settingsSaveFailed"));
      }
      onUpdated({
        title: result.title,
        gameSystem: result.gameSystem ?? "",
        isPublic: result.isPublic,
      });
      onClose();
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("settingsSaveFailed"),
      );
    } finally {
      setPending(false);
    }
  }

  async function deleteTemplate() {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(result.error?.message ?? t("deleteSystemFailed"));
      }
      router.replace("/dashboard/systems");
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("deleteSystemFailed"),
      );
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-settings-title"
        className="w-full max-w-xl rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-overlay)]"
      >
        <header className="flex items-center justify-between border-b px-6 py-5">
          <div>
            <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              {t("settingsEyebrow")}
            </p>
            <h2
              id="template-settings-title"
              className="mt-1 text-2xl font-bold"
            >
              {t("settingsTitle")}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("closeSettings")}
            onClick={onClose}
            disabled={pending || deleting}
          >
            <X className="size-5" />
          </Button>
        </header>

        <form action={submit} className="space-y-5 p-6">
          <label className="block space-y-2 text-sm font-semibold">
            <span>{t("templateName")}</span>
            <Input
              name="title"
              required
              maxLength={160}
              defaultValue={value.title}
            />
          </label>
          <label className="block space-y-2 text-sm font-semibold">
            <span>{t("gameSystem")}</span>
            <Input
              name="gameSystem"
              required
              maxLength={160}
              defaultValue={value.gameSystem}
            />
          </label>
          <label className="flex gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <input
              className="mt-1 size-4 accent-[var(--brand)]"
              name="isPublic"
              type="checkbox"
              defaultChecked={value.isPublic}
            />
            <span>
              <span className="flex items-center gap-2 font-semibold">
                <Globe2 className="size-4 text-[var(--brand)]" />
                {t("publicVisibility")}
              </span>
              <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
                {t("publicVisibilityText")}
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
          <Button className="w-full" disabled={pending || deleting}>
            {pending ? t("savingSettings") : t("saveSettings")}
          </Button>
        </form>

        <div className="border-t border-red-100 bg-red-50/55 px-6 py-5">
          {!confirmDelete ? (
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-semibold text-red-700"
              onClick={() => setConfirmDelete(true)}
              disabled={pending || deleting}
            >
              <Trash2 className="size-4" />
              {t("deleteSystem")}
            </button>
          ) : (
            <div className="flex items-center justify-between gap-5">
              <p className="max-w-sm text-sm leading-6 text-red-900">
                {t("deleteSystemConfirm")}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => void deleteTemplate()}
                  disabled={deleting}
                >
                  {deleting ? t("deletingSystem") : t("deleteSystemForever")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function TemplateMapper({
  initialTemplate,
}: {
  initialTemplate: TemplateEditorData;
}) {
  const t = useTranslations("Systems");
  const router = useRouter();
  const [fields, setFields] = useState(initialTemplate.fields);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1.05);
  const [approvedAt, setApprovedAt] = useState(initialTemplate.approvedAt);
  const [approving, setApproving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateSettings, setTemplateSettings] =
    useState<TemplateSettingsValue>({
      title: initialTemplate.title,
      gameSystem: initialTemplate.gameSystem ?? "",
      isPublic: initialTemplate.isPublic,
    });

  useEffect(() => {
    let cancelled = false;
    void import("pdfjs-dist")
      .then(async (pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = "/api/pdf-worker";
        if (!initialTemplate.pdfUrl) throw new Error("PDF URL is missing");
        const loaded = await pdfjs.getDocument({ url: initialTemplate.pdfUrl })
          .promise;
        if (!cancelled) setPdf(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPdfError(
            error instanceof Error ? error.message : "PDF load failed",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialTemplate.pdfUrl]);

  const filtered = useMemo(() => {
    const normalized = query.toLocaleLowerCase();
    return fields.filter((field) =>
      `${field.label} ${field.pdfName} ${field.section ?? ""} ${field.aliases.join(" ")}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [fields, query]);
  const activeField = activeFieldId
    ? (fields.find((field) => field.id === activeFieldId) ?? null)
    : null;

  function selectField(fieldId: string) {
    setActiveFieldId(fieldId);
    const field = fields.find((candidate) => candidate.id === fieldId);
    const widget = field?.widgets[0];
    if (widget) {
      document
        .getElementById(`template-field-widget-${widget.id}`)
        ?.scrollIntoView({
          behavior: "auto",
          block: "center",
          inline: "center",
        });
    }
  }

  function saveField(saved: TemplateField) {
    setFields((current) =>
      current.map((field) => (field.id === saved.id ? saved : field)),
    );
    setApprovedAt(null);
    setNotice(t("savedField"));
  }

  async function approve() {
    setApproving(true);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/templates/${initialTemplate.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved: true }),
        },
      );
      const result = (await response.json()) as {
        approvedAt?: string;
        error?: { message?: string };
      };
      if (!response.ok || !result.approvedAt) {
        throw new Error(result.error?.message ?? t("approveFailed"));
      }
      setApprovedAt(result.approvedAt);
      setNotice(t("approvedNotice"));
      router.refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : t("approveFailed"));
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-w-[980px] flex-col bg-[var(--slate)]/45">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <Link
          href="/dashboard/systems"
          className="grid size-9 place-items-center rounded-[7px] hover:bg-[var(--keylime)]"
          aria-label={t("back")}
          title={t("back")}
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[var(--muted)]">
            {templateSettings.gameSystem}
          </p>
          <h1 className="truncate font-bold">{templateSettings.title}</h1>
        </div>
        <div
          className={cn(
            "ml-2 flex items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 text-xs font-semibold",
            approvedAt
              ? "bg-emerald-50 text-emerald-800"
              : "bg-amber-50 text-amber-800",
          )}
        >
          {approvedAt ? <Check className="size-4" /> : null}
          {approvedAt ? t("approvedState") : t("needsReview")}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="mr-2 flex items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--keylime)] px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)]">
            {templateSettings.isPublic ? (
              <Globe2 className="size-3.5" />
            ) : (
              <Lock className="size-3.5" />
            )}
            {templateSettings.isPublic
              ? approvedAt
                ? t("publishedNow")
                : t("published")
              : t("private")}
          </div>
          <Button
            variant="ghost"
            size="icon"
            title={t("settingsTitle")}
            aria-label={t("settingsTitle")}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="size-4" />
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
          {!approvedAt && (
            <Button className="ml-2" onClick={approve} disabled={approving}>
              <CheckCircle2 className="size-4" />
              {approving ? t("approving") : t("approve")}
            </Button>
          )}
        </div>
      </header>
      {notice && (
        <div className="flex items-center justify-between border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
      {settingsOpen && (
        <TemplateSettingsDialog
          templateId={initialTemplate.id}
          value={templateSettings}
          onClose={() => setSettingsOpen(false)}
          onUpdated={(updated) => {
            setTemplateSettings(updated);
            setNotice(t("settingsSaved"));
          }}
        />
      )}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
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
                type="button"
                className={cn(
                  "mb-1 w-full rounded-[var(--radius-control)] border border-transparent p-3 text-left transition-colors hover:bg-[var(--keylime)]/60",
                  field.id === activeFieldId &&
                    "border-[var(--brand)]/20 bg-[var(--keylime)] hover:bg-[var(--keylime)]",
                  !field.enabled && "opacity-55",
                )}
                onClick={() => selectField(field.id)}
              >
                <span className="flex items-start justify-between gap-2">
                  <strong className="text-sm">{field.label}</strong>
                  <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px]">
                    {t("page", { page: field.page })}
                  </span>
                </span>
                <span className="mt-1 block truncate font-mono text-[11px] text-[var(--muted)]">
                  {field.pdfName}
                </span>
                {field.section && (
                  <span className="mt-1 block truncate text-xs text-[var(--muted)]">
                    {field.section}
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        <main className="scrollbar-thin flex-1 overflow-auto p-6 lg:p-8">
          <div className="mx-auto flex w-fit flex-col gap-8">
            {pdf ? (
              Array.from({ length: pdf.numPages }, (_, index) => (
                <TemplatePdfPage
                  key={index + 1}
                  document={pdf}
                  pageNumber={index + 1}
                  zoom={zoom}
                  fields={fields}
                  activeFieldId={activeFieldId}
                  onSelectField={selectField}
                />
              ))
            ) : pdfError ? (
              <div className="grid h-96 w-[612px] place-items-center rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-10 text-center">
                <div>
                  <p className="font-semibold">{pdfError}</p>
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
              <div className="grid h-96 w-[612px] place-items-center rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)]">
                {t("processingStep")}
              </div>
            )}
          </div>
        </main>

        <aside className="w-96 shrink-0 border-l border-[var(--border)] bg-[var(--surface)]">
          {activeField ? (
            <FieldInspector
              key={activeField.id}
              templateId={initialTemplate.id}
              field={activeField}
              onSaved={saveField}
            />
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <div className="mx-auto grid size-12 place-items-center rounded-[var(--radius-control)] bg-[var(--slate)]/35 text-[var(--info)]">
                  <Search className="size-6" />
                </div>
                <h2 className="mt-5 text-lg font-bold">{t("selectField")}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {t("selectFieldText")}
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
