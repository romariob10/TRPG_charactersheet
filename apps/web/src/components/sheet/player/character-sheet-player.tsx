"use client";

import { CHARACTER_FONT_SIZE_FIELD, getCharacterFontSize, characterSheetStateSchema } from "@mycharacter/contracts";
import { apiFetch } from "@/lib/api/client";
import { AgentPresence } from "@/components/agent-presence";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Printer } from "lucide-react";
import type {
  CharacterRepeaterRow,
  FieldMutationResponse,
  FieldValue,
  SheetVersionDetails,
  TargetLayoutKind,
} from "@mycharacter/contracts";
import { SheetNodeRenderer } from "../renderer/sheet-node-renderer";
import { SheetRenderProvider } from "../renderer/sheet-render-context";
import { SheetViewSwitcher, type SheetViewMode } from "../sheet-view-switcher";

const PRINT_CANVAS_WIDTH = 595;
const PRINT_CANVAS_HEIGHT = 874;
const MOBILE_LAYOUT_QUERY = "(max-width: 767px)";
const FIELD_SAVE_DELAY_MS = 300;

interface CharacterSheetPlayerProps {
  character: {
    id: string;
    name: string;
    fieldValues?: Record<string, FieldValue>;
    fieldVersions?: Record<string, number>;
  };
  versionDetails?: SheetVersionDetails | null;
  canEdit: boolean;
}

export const CharacterSheetPlayer: React.FC<CharacterSheetPlayerProps> = ({
  character,
  versionDetails,
  canEdit,
}) => {
  const t = useTranslations("Player");
  const [viewMode, setViewMode] = useState<SheetViewMode>("adaptive");
  const [adaptiveTarget, setAdaptiveTarget] =
    useState<Extract<TargetLayoutKind, "mobile" | "desktop">>("desktop");
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>(
    character.fieldValues ?? {},
  );
  const [repeaterRows, setRepeaterRows] = useState<
    Record<string, CharacterRepeaterRow[]>
  >({});
  const [pendingFieldCount, setPendingFieldCount] = useState(0);
  const [activeFieldSaves, setActiveFieldSaves] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfAction, setPdfAction] = useState<"export" | "print" | null>(null);
  const fieldVersions = useRef<Record<string, number>>(
    character.fieldVersions ?? {},
  );
  const pendingFieldValues = useRef(new Map<string, FieldValue>());
  const fieldSaveTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const fieldsInFlight = useRef(new Set<string>());

  const syncAgentChanges = async (signal: AbortSignal) => {
    const state = characterSheetStateSchema.parse(await apiFetch<unknown>(`/api/characters/${character.id}/sheet-state`, { signal }));
    if (signal.aborted) return;
    const changes: Record<string, FieldValue> = {};
    for (const [key, value] of Object.entries(state.values)) {
      if (pendingFieldValues.current.has(key) || fieldsInFlight.current.has(key)) continue;
      const version = state.versions[key] ?? 0;
      if (version <= (fieldVersions.current[key] ?? -1)) continue;
      fieldVersions.current[key] = version;
      changes[key] = value;
    }
    if (Object.keys(changes).length) setFieldValues(previous => ({ ...previous, ...changes }));
  };

  useEffect(() => {
    const media = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const updateTarget = () =>
      setAdaptiveTarget(media.matches ? "mobile" : "desktop");
    updateTarget();
    media.addEventListener("change", updateTarget);
    return () => media.removeEventListener("change", updateTarget);
  }, []);

  const target: TargetLayoutKind =
    viewMode === "print" ? "print" : adaptiveTarget;

  useEffect(() => {
    if (!versionDetails) return;
    const keys = new Set<string>();
    const visit = (node: typeof versionDetails.layouts.desktop): void => {
      if (node.kind === "repeater") keys.add(node.config.key);
      if ("children" in node && Array.isArray(node.children))
        node.children.forEach(visit);
      if ("rowTemplate" in node && node.rowTemplate) visit(node.rowTemplate);
    };
    Object.values(versionDetails.layouts).forEach(visit);
    const controller = new AbortController();
    void Promise.all(
      Array.from(keys, async (key) => {
        const response = await fetch(
          `/api/characters/${character.id}/repeaters/${encodeURIComponent(key)}/rows`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(t("saveFailed"));
        return [key, await response.json()] as const;
      }),
    )
      .then((entries) => setRepeaterRows(Object.fromEntries(entries)))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setSaveError(
            error instanceof Error ? error.message : t("saveFailed"),
          );
      });
    return () => controller.abort();
  }, [character.id, t, versionDetails]);

  const flushFieldValue = useCallback(
    async (key: string) => {
      if (
        fieldsInFlight.current.has(key) ||
        !pendingFieldValues.current.has(key)
      ) {
        return;
      }

      const value = pendingFieldValues.current.get(key) ?? null;
      pendingFieldValues.current.delete(key);
      setPendingFieldCount(pendingFieldValues.current.size);
      fieldsInFlight.current.add(key);
      setActiveFieldSaves((count) => count + 1);
      let retryDelay = 0;

      try {
        const res = await fetch(
          `/api/characters/${character.id}/sheet-fields/${encodeURIComponent(key)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
              value,
              expectedVersion: fieldVersions.current[key] ?? 0,
              clientMutationId: crypto.randomUUID(),
            }),
          },
        );

        if (!res.ok) throw new Error(t("saveFailed"));
        const saved = (await res.json()) as FieldMutationResponse;
        fieldVersions.current[key] = saved.version;
        setSaveError(null);
      } catch (err: unknown) {
        if (!pendingFieldValues.current.has(key)) {
          pendingFieldValues.current.set(key, value);
        }
        retryDelay = 1_000;
        setSaveError(err instanceof Error ? err.message : t("saveFailed"));
      } finally {
        setPendingFieldCount(pendingFieldValues.current.size);
        fieldsInFlight.current.delete(key);
        setActiveFieldSaves((count) => Math.max(0, count - 1));
        if (pendingFieldValues.current.has(key)) {
          const timer = setTimeout(() => {
            fieldSaveTimers.current.delete(key);
            void flushFieldValue(key);
          }, retryDelay);
          fieldSaveTimers.current.set(key, timer);
        }
      }
    },
    [character.id, t],
  );

  const handleFieldValueChange = (key: string, value: FieldValue) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
    setSaveError(null);
    pendingFieldValues.current.set(key, value);
    setPendingFieldCount(pendingFieldValues.current.size);
    const previousTimer = fieldSaveTimers.current.get(key);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      fieldSaveTimers.current.delete(key);
      void flushFieldValue(key);
    }, FIELD_SAVE_DELAY_MS);
    fieldSaveTimers.current.set(key, timer);
  };

  const handleFieldCommit = (key: string) => {
    const timer = fieldSaveTimers.current.get(key);
    if (timer) clearTimeout(timer);
    fieldSaveTimers.current.delete(key);
    void flushFieldValue(key);
  };

  useEffect(() => {
    const timers = fieldSaveTimers.current;
    const flushPendingValues = () => {
      for (const [key, value] of pendingFieldValues.current) {
        void fetch(
          `/api/characters/${character.id}/sheet-fields/${encodeURIComponent(key)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
              value,
              expectedVersion: fieldVersions.current[key] ?? 0,
              clientMutationId: crypto.randomUUID(),
            }),
          },
        );
      }
    };
    window.addEventListener("pagehide", flushPendingValues);
    return () => {
      window.removeEventListener("pagehide", flushPendingValues);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [character.id]);

  // Repeater row handlers
  const handleAddRepeaterRow = async (repeaterKey: string) => {
    try {
      const res = await fetch(
        `/api/characters/${character.id}/repeaters/rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repeaterKey,
            clientMutationId: crypto.randomUUID(),
            initialValues: {},
          }),
        },
      );
      if (!res.ok) throw new Error(t("saveFailed"));
      const newRow: CharacterRepeaterRow = await res.json();
      setRepeaterRows((prev) => ({
        ...prev,
        [repeaterKey]: [...(prev[repeaterKey] ?? []), newRow],
      }));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("saveFailed"));
    }
  };

  const handleUpdateRepeaterRowField = async (
    repeaterKey: string,
    rowId: string,
    slotId: string,
    value: unknown,
    expectedVersion: number,
  ) => {
    const previousRow = (repeaterRows[repeaterKey] ?? []).find(
      (row) => row.id === rowId,
    );
    const rowVal = Array.isArray(value)
      ? value.join(", ")
      : (value as string | number | boolean | null);
    setRepeaterRows((prev) => {
      const list = prev[repeaterKey] ?? [];
      return {
        ...prev,
        [repeaterKey]: list.map((r) =>
          r.id === rowId
            ? { ...r, values: { ...r.values, [slotId]: rowVal } }
            : r,
        ),
      };
    });

    try {
      const res = await fetch(
        `/api/characters/${character.id}/repeaters/rows/${rowId}/slots/${slotId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            value,
            expectedVersion,
            clientMutationId: crypto.randomUUID(),
          }),
        },
      );
      if (!res.ok)
        throw new Error(
          res.status === 409 ? t("versionConflict") : t("saveFailed"),
        );
      const updatedRow: CharacterRepeaterRow = await res.json();
      setRepeaterRows((prev) => ({
        ...prev,
        [repeaterKey]: (prev[repeaterKey] ?? []).map((r) =>
          r.id === rowId ? updatedRow : r,
        ),
      }));
    } catch (err) {
      if (previousRow)
        setRepeaterRows((prev) => ({
          ...prev,
          [repeaterKey]: (prev[repeaterKey] ?? []).map((r) =>
            r.id === rowId ? previousRow : r,
          ),
        }));
      setSaveError(err instanceof Error ? err.message : t("saveFailed"));
    }
  };

  const handleRemoveRepeaterRow = async (
    repeaterKey: string,
    rowId: string,
  ) => {
    const previousRows = repeaterRows[repeaterKey] ?? [];
    setRepeaterRows((prev) => {
      const list = prev[repeaterKey] ?? [];
      return {
        ...prev,
        [repeaterKey]: list.filter((r) => r.id !== rowId),
      };
    });

    try {
      const response = await fetch(
        `/api/characters/${character.id}/repeaters/rows/${rowId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientMutationId: crypto.randomUUID(),
          }),
        },
      );
      if (!response.ok) throw new Error(t("saveFailed"));
    } catch (err) {
      setRepeaterRows((prev) => ({ ...prev, [repeaterKey]: previousRows }));
      setSaveError(err instanceof Error ? err.message : t("saveFailed"));
    }
  };

  const handleReorderRepeaterRows = async (
    repeaterKey: string,
    rowIds: string[],
  ) => {
    const previousRows = repeaterRows[repeaterKey] ?? [];
    const rowsById = new Map(previousRows.map((row) => [row.id, row]));
    setRepeaterRows((prev) => ({
      ...prev,
      [repeaterKey]: rowIds.flatMap((id) => rowsById.get(id) ?? []),
    }));
    try {
      const response = await fetch(
        `/api/characters/${character.id}/repeaters/reorder`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repeaterKey,
            rowIds,
            clientMutationId: crypto.randomUUID(),
          }),
        },
      );
      if (!response.ok) throw new Error(t("saveFailed"));
    } catch (err) {
      setRepeaterRows((prev) => ({ ...prev, [repeaterKey]: previousRows }));
      setSaveError(err instanceof Error ? err.message : t("saveFailed"));
    }
  };

  const handlePdfAction = async (action: "export" | "print") => {
    const printWindow = action === "print" ? window.open("", "_blank") : null;
    setPdfAction(action);
    setSaveError(null);
    try {
      const response = await fetch(
        `/api/characters/${character.id}/export?mode=${
          action === "print" ? "flattened" : "interactive"
        }`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(t("exportFailed"));

      const pdfUrl = URL.createObjectURL(await response.blob());
      if (action === "print") {
        if (!printWindow) throw new Error(t("printPopupBlocked"));
        printWindow.location.href = pdfUrl;
        window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
      } else {
        const anchor = document.createElement("a");
        anchor.href = pdfUrl;
        anchor.download = `${character.name.replace(/[^\p{L}\p{N}_-]+/gu, "-") || "character"}.pdf`;
        anchor.click();
        // Browsers can start consuming the blob after the click handler returns.
        window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
      }
    } catch (error: unknown) {
      printWindow?.close();
      setSaveError(error instanceof Error ? error.message : t("exportFailed"));
    } finally {
      setPdfAction(null);
    }
  };

  const handleImageUpload = async (fieldBinding: string, file: File, aspectRatio: number) => {
    setActiveFieldSaves((count) => count + 1);
    setSaveError(null);
    const formData = new FormData();
    formData.set("file", file);
    try {
      const response = await fetch(
        `/api/characters/${character.id}/images?fieldKey=${encodeURIComponent(fieldBinding)}`,
        { method: "POST", body: formData },
      );
      if (!response.ok) throw new Error(t("imageUploadFailed"));
      const result = (await response.json()) as { file: { url: string; fieldVersion: number } };
      const aspectRatioKey = `__image_aspect_ratio__:${fieldBinding}`;
      setFieldValues((previous) => ({
        ...previous,
        [fieldBinding]: result.file.url,
        [aspectRatioKey]: aspectRatio,
      }));
      fieldVersions.current[fieldBinding] = result.file.fieldVersion;
      handleFieldValueChange(aspectRatioKey, aspectRatio);
      handleFieldCommit(aspectRatioKey);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("imageUploadFailed"));
      throw error;
    } finally {
      setActiveFieldSaves((count) => Math.max(0, count - 1));
    }
  };

  const rootNode =
    versionDetails?.layouts[target] ?? versionDetails?.layouts.desktop;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Player Header */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 px-3 lg:px-6 py-3 bg-card/90 backdrop-blur border-b border-border shadow-sm print:hidden">
        <div className="flex min-w-0 max-w-full items-center gap-3 pl-12 lg:pl-0">
          <a
            href="/dashboard"
            className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            ← {t("back")}
          </a>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-base font-bold text-foreground truncate">
            {character.name || t("unnamed")}
          </h1>
          {activeFieldSaves > 0 && (
            <span className="text-xs text-muted-foreground italic">
              {t("saving")}
            </span>
          )}
          {saveError && (
            <span className="text-xs text-destructive font-medium">
              {saveError}
            </span>
          )}
        </div>

        {/* Target Switcher */}
        <SheetViewSwitcher
          value={viewMode}
          onChange={setViewMode}
          adaptiveLabel={t("adaptive")}
          printLabel={t("print")}
        />

        {/* Export & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <label className="flex items-center gap-2 text-xs font-semibold">
              {t("mainFontSize")}
              <input type="range" min={8} max={24} step={1} value={getCharacterFontSize(fieldValues)}
                aria-label={t("mainFontSize")} className="w-24 accent-primary"
                onChange={(event) => handleFieldValueChange(CHARACTER_FONT_SIZE_FIELD, Number(event.target.value))}
                onBlur={() => handleFieldCommit(CHARACTER_FONT_SIZE_FIELD)} />
              <output className="min-w-8 tabular-nums">{getCharacterFontSize(fieldValues)} px</output>
            </label>
          )}
          <button
            type="button"
            onClick={() => void handlePdfAction("export")}
            disabled={pdfAction !== null || activeFieldSaves > 0 || pendingFieldCount > 0}
            className="px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 shadow-sm transition-colors flex items-center gap-1.5 disabled:pointer-events-none disabled:opacity-60"
          >
            <Download className="size-3.5" />
            <span>{t("exportPdf")}</span>
          </button>
          <button
            type="button"
            onClick={() => void handlePdfAction("print")}
            disabled={pdfAction !== null || activeFieldSaves > 0 || pendingFieldCount > 0}
            className="px-3 py-1.5 border border-border text-foreground text-xs font-semibold rounded-md hover:bg-muted transition-colors flex items-center gap-1.5 disabled:pointer-events-none disabled:opacity-60"
          >
            <Printer className="size-3.5" />
            <span>{t("printAction")}</span>
          </button>
        </div>
      </header>

      {/* Main Sheet Render Area */}
      <main className="flex-1 flex justify-center p-4 md:p-8 overflow-x-auto">
        {rootNode ? (
          <div
            data-sheet-page
            data-sheet-target={target}
            style={
              target === "print"
                ? { width: PRINT_CANVAS_WIDTH, height: rootNode.box.height.mode === "fixed" ? rootNode.box.height.value : PRINT_CANVAS_HEIGHT }
                : undefined
            }
            className={`relative flex flex-col items-center w-full ${
              target === "mobile"
                ? "max-w-md"
                : target === "print"
                  ? "max-w-none flex-none overflow-hidden rounded-sm bg-white text-black shadow-2xl"
                  : "max-w-5xl"
            }`}
          >
            <AgentPresence resourceType="character" resourceId={character.id} target={target} onSync={syncAgentChanges} />
            <SheetRenderProvider
              value={{
                target,
                mode:
                  target === "print"
                    ? "print"
                    : canEdit
                      ? "player"
                      : "readonly",
                fieldValues,
                onFieldValueChange: handleFieldValueChange,
                onFieldCommit: handleFieldCommit,
                onImageUpload: canEdit ? handleImageUpload : undefined,
                repeaterRows,
                onAddRepeaterRow: handleAddRepeaterRow,
                onUpdateRepeaterRowField: handleUpdateRepeaterRowField,
                onRemoveRepeaterRow: handleRemoveRepeaterRow,
                onReorderRepeaterRows: handleReorderRepeaterRows,
              }}
            >
              <SheetNodeRenderer node={rootNode} />
            </SheetRenderProvider>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {t("noLayout")}
          </div>
        )}
      </main>
    </div>
  );
};
