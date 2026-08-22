"use client";

import React, { useState } from "react";
import type {
  CharacterRepeaterRow,
  FieldValue,
  SheetVersionDetails,
  TargetLayoutKind,
} from "@mycharacter/contracts";
import { TARGET_LAYOUT_KINDS } from "@mycharacter/contracts";
import { SheetNodeRenderer } from "../renderer/sheet-node-renderer.js";
import { SheetRenderProvider } from "../renderer/sheet-render-context.js";

interface CharacterSheetPlayerProps {
  character: {
    id: string;
    name: string;
    fieldValues?: Record<string, FieldValue>;
  };
  versionDetails?: SheetVersionDetails | null;
  isOwner: boolean;
}

export const CharacterSheetPlayer: React.FC<CharacterSheetPlayerProps> = ({
  character,
  versionDetails,
  isOwner,
}) => {
  const [target, setTarget] = useState<TargetLayoutKind>("desktop");
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>(
    character.fieldValues ?? {},
  );
  const [repeaterRows, setRepeaterRows] = useState<
    Record<string, CharacterRepeaterRow[]>
  >({});
  const [savingField, setSavingField] = useState(false);

  // Field change handler
  const handleFieldValueChange = async (key: string, value: FieldValue) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
    setSavingField(true);
    try {
      await fetch(`/api/characters/${character.id}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mutations: [{ key, value }],
        }),
      });
    } catch (err) {
      console.error("Failed to save field value", err);
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
      if (res.ok) {
        const newRow: CharacterRepeaterRow = await res.json();
        setRepeaterRows((prev) => ({
          ...prev,
          [repeaterKey]: [...(prev[repeaterKey] ?? []), newRow],
        }));
      }
    } catch (err) {
      console.error("Failed to add repeater row", err);
    }
  };

  const handleUpdateRepeaterRowField = async (
    repeaterKey: string,
    rowId: string,
    slotId: string,
    value: unknown,
    expectedVersion: number,
  ) => {
    // Optimistic update
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
      if (res.ok) {
        const updatedRow: CharacterRepeaterRow = await res.json();
        setRepeaterRows((prev) => {
          const list = prev[repeaterKey] ?? [];
          return {
            ...prev,
            [repeaterKey]: list.map((r) =>
              r.id === rowId ? updatedRow : r,
            ),
          };
        });
      }
    } catch (err) {
      console.error("Failed to update repeater row field", err);
    }
  };

  const handleRemoveRepeaterRow = async (
    repeaterKey: string,
    rowId: string,
  ) => {
    // Optimistic remove
    setRepeaterRows((prev) => {
      const list = prev[repeaterKey] ?? [];
      return {
        ...prev,
        [repeaterKey]: list.filter((r) => r.id !== rowId),
      };
    });

    try {
      await fetch(
        `/api/characters/${character.id}/repeaters/rows/${rowId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientMutationId: crypto.randomUUID(),
          }),
        },
      );
    } catch (err) {
      console.error("Failed to delete repeater row", err);
    }
  };

  const handleReorderRepeaterRows = async (
    repeaterKey: string,
    rowIds: string[],
  ) => {
    try {
      await fetch(`/api/characters/${character.id}/repeaters/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repeaterKey,
          rowIds,
          clientMutationId: crypto.randomUUID(),
        }),
      });
    } catch (err) {
      console.error("Failed to reorder repeater rows", err);
    }
  };

  const handlePrint = () => {
    window.print();
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
            ← Back
          </a>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-base font-bold text-foreground truncate">
            {character.name || "Unnamed Character"}
          </h1>
          {savingField && (
            <span className="text-xs text-muted-foreground italic">Saving…</span>
          )}
        </div>

        {/* Target Switcher */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
          {TARGET_LAYOUT_KINDS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTarget(t)}
              className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                target === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Export & Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 shadow-sm transition-colors flex items-center gap-1.5"
          >
            <span>🖨️</span>
            <span>Print / PDF</span>
          </button>
        </div>
      </header>

      {/* Main Sheet Render Area */}
      <main className="flex-1 flex justify-center p-4 md:p-8 overflow-x-hidden">
        {rootNode ? (
          <div
            className={`w-full ${
              target === "mobile"
                ? "max-w-md"
                : target === "tablet"
                ? "max-w-2xl"
                : target === "print"
                ? "max-w-[794px] bg-white text-black p-8 shadow-2xl rounded-sm"
                : "max-w-5xl"
            }`}
          >
            <SheetRenderProvider
              value={{
                target,
                mode: isOwner ? "player" : "readonly",
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
            No sheet blueprint layout available for this character.
          </div>
        )}
      </main>
    </div>
  );
};
