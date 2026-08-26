"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Download,
  FileText,
  Monitor,
  Printer,
  Smartphone,
  Tablet,
} from "lucide-react";
import type {
  CharacterRepeaterRow,
  FieldValue,
  SheetVersionDetails,
  TargetLayoutKind,
} from "@mycharacter/contracts";
import { SheetNodeRenderer } from "../renderer/sheet-node-renderer";
import { SheetRenderProvider } from "../renderer/sheet-render-context";

interface CharacterSheetPlayerProps {
  character: {
    id: string;
    name: string;
    fieldValues?: Record<string, FieldValue>;
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
  const [target, setTarget] = useState<TargetLayoutKind>("desktop");
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>(
    character.fieldValues ?? {},
  );
  const [repeaterRows, setRepeaterRows] = useState<
    Record<string, CharacterRepeaterRow[]>
  >({});
  const [savingField, setSavingField] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fieldMutationIds = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!versionDetails) return;
    const keys = new Set<string>();
    const visit = (node: (typeof versionDetails.layouts.desktop)): void => {
      if (node.kind === "repeater") keys.add(node.config.key);
      if ("children" in node && Array.isArray(node.children)) node.children.forEach(visit);
      if ("rowTemplate" in node && node.rowTemplate) visit(node.rowTemplate);
    };
    Object.values(versionDetails.layouts).forEach(visit);
    const controller = new AbortController();
    void Promise.all(Array.from(keys, async (key) => {
      const response = await fetch(
        `/api/characters/${character.id}/repeaters/${encodeURIComponent(key)}/rows`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error(t("saveFailed"));
      return [key, await response.json()] as const;
    })).then((entries) => setRepeaterRows(Object.fromEntries(entries)))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSaveError(error instanceof Error ? error.message : t("saveFailed"));
      });
    return () => controller.abort();
  }, [character.id, t, versionDetails]);

  // Field change handler with optimistic update and rollback
  const handleFieldValueChange = async (key: string, value: FieldValue) => {
    const prevValue = fieldValues[key];
    const mutationId = crypto.randomUUID();
    fieldMutationIds.current[key] = mutationId;
    setFieldValues((prev) => ({ ...prev, [key]: value }));
    setSavingField(true);
    setSaveError(null);

    try {
      const res = await fetch(
        `/api/characters/${character.id}/sheet-fields/${encodeURIComponent(key)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            value,
            clientMutationId: mutationId,
          }),
        },
      );

      if (!res.ok) {
        if (res.status === 409) {
          throw new Error(t("versionConflict"));
        }
        throw new Error(t("saveFailed"));
      }
    } catch (err: unknown) {
      // Rollback on error
      if (fieldMutationIds.current[key] === mutationId) {
        setFieldValues((prev) => ({ ...prev, [key]: prevValue }));
      }
      setSaveError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSavingField(false);
    }
  };

  // Repeater row handlers
  const handleAddRepeaterRow = async (repeaterKey: string) => {
    try {
      const res = await fetch(`/api/characters/${character.id}/repeaters/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repeaterKey,
          clientMutationId: crypto.randomUUID(),
          initialValues: {},
        }),
      });
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
    const previousRow = (repeaterRows[repeaterKey] ?? []).find((row) => row.id === rowId);
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
      if (!res.ok) throw new Error(res.status === 409 ? t("versionConflict") : t("saveFailed"));
      const updatedRow: CharacterRepeaterRow = await res.json();
      setRepeaterRows((prev) => ({ ...prev, [repeaterKey]: (prev[repeaterKey] ?? []).map((r) => r.id === rowId ? updatedRow : r) }));
    } catch (err) {
      if (previousRow) setRepeaterRows((prev) => ({ ...prev, [repeaterKey]: (prev[repeaterKey] ?? []).map((r) => r.id === rowId ? previousRow : r) }));
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
    setRepeaterRows((prev) => ({ ...prev, [repeaterKey]: rowIds.flatMap((id) => rowsById.get(id) ?? []) }));
    try {
      const response = await fetch(`/api/characters/${character.id}/repeaters/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repeaterKey,
          rowIds,
          clientMutationId: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error(t("saveFailed"));
    } catch (err) {
      setRepeaterRows((prev) => ({ ...prev, [repeaterKey]: previousRows }));
      setSaveError(err instanceof Error ? err.message : t("saveFailed"));
    }
  };

  const rootNode = versionDetails?.layouts[target] ?? versionDetails?.layouts.desktop;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Player Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 bg-card/90 backdrop-blur border-b border-border shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <a
            href="/dashboard"
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            ← {t("back")}
          </a>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-base font-bold text-foreground truncate">
            {character.name || t("unnamed")}
          </h1>
          {savingField && (
            <span className="text-xs text-muted-foreground italic">{t("saving")}</span>
          )}
          {saveError && (
            <span className="text-xs text-destructive font-medium">{saveError}</span>
          )}
        </div>

        {/* Target Switcher */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setTarget("mobile")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              target === "mobile"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Smartphone className="size-3.5" />
            <span>{t("mobile")}</span>
          </button>
          <button
            type="button"
            onClick={() => setTarget("tablet")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              target === "tablet"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Tablet className="size-3.5" />
            <span>{t("tablet")}</span>
          </button>
          <button
            type="button"
            onClick={() => setTarget("desktop")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              target === "desktop"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Monitor className="size-3.5" />
            <span>{t("desktop")}</span>
          </button>
          <button
            type="button"
            onClick={() => setTarget("print")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              target === "print"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="size-3.5" />
            <span>{t("print")}</span>
          </button>
        </div>

        {/* Export & Actions */}
        <div className="flex items-center gap-2">
          <a
            href={`/api/characters/${character.id}/export?mode=interactive`}
            download
            className="px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 shadow-sm transition-colors flex items-center gap-1.5"
          >
            <Download className="size-3.5" />
            <span>{t("exportPdf")}</span>
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 border border-border text-foreground text-xs font-semibold rounded-md hover:bg-muted transition-colors flex items-center gap-1.5"
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
            className={`w-full ${
              target === "mobile"
                ? "max-w-md"
                : target === "tablet"
                ? "max-w-2xl"
                : target === "print"
                ? "w-[794px] h-[1123px] max-w-none flex-none bg-white text-black shadow-2xl rounded-sm"
                : "max-w-5xl"
            }`}
          >
            <SheetRenderProvider
              value={{
                target,
                mode: canEdit ? "player" : "readonly",
                fieldValues,
                onFieldValueChange: handleFieldValueChange,
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
