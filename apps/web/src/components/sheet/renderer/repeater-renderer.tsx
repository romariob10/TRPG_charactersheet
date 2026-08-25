"use client";

import React, { useState } from "react";
import type { RepeaterNode } from "@mycharacter/contracts";
import { SheetNodeRenderer } from "./sheet-node-renderer";
import { SheetRenderProvider, useSheetRender } from "./sheet-render-context";

export const RepeaterRenderer: React.FC<{ node: RepeaterNode }> = ({ node }) => {
  const context = useSheetRender();
  const { mode, repeaterRows, onAddRepeaterRow, onUpdateRepeaterRowField, onRemoveRepeaterRow, onReorderRepeaterRows } = context;
  const config = node.config;
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isPrintOrReadonly = mode === "readonly" || mode === "print";

  if (config.mode === "design" || mode === "builder") {
    // Design-time repeat: render initialRows count of template
    const count = Math.max(config.initialRows || 1, 1);
    return (
      <div className="flex flex-col gap-2 w-full">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="w-full">
            <SheetNodeRenderer node={node.rowTemplate} />
          </div>
        ))}
      </div>
    );
  }

  // Runtime collection mode
  const rows = repeaterRows?.[config.key] ?? [];

  const handleAdd = async () => {
    if (rows.length >= config.maxRows) return;
    await onAddRepeaterRow?.(config.key);
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rows.length) return;

    const newRows = [...rows];
    const [moved] = newRows.splice(index, 1);
    newRows.splice(targetIndex, 0, moved);

    await onReorderRepeaterRows?.(
      config.key,
      newRows.map((r) => r.id),
    );
  };

  const handleDelete = async (rowId: string) => {
    await onRemoveRepeaterRow?.(config.key, rowId);
    setConfirmDeleteId(null);
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {rows.length === 0 && (
        <div className="text-xs text-muted-foreground italic py-2 text-center border border-dashed border-border rounded">
          {config.emptyStateText || "No items added yet."}
        </div>
      )}

      {rows.map((row, index) => {
        // Create scoped render context for this row
        const rowFieldValues: Record<string, string | number | boolean | string[] | null> = {};
        for (const [k, v] of Object.entries(row.values)) {
          rowFieldValues[k] = v;
        }

        const scopedContext = {
          ...context,
          fieldValues: rowFieldValues,
          onFieldValueChange: (slotId: string, val: unknown) => {
            onUpdateRepeaterRowField?.(
              config.key,
              row.id,
              slotId,
              val,
              row.version,
            );
          },
        };

        return (
          <div
            key={row.id}
            className="flex items-center gap-2 group relative w-full"
          >
            <div className="flex-1 w-full">
              <SheetRenderProvider value={scopedContext}>
                <SheetNodeRenderer node={node.rowTemplate} />
              </SheetRenderProvider>
            </div>

            {!isPrintOrReadonly && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {config.allowReorder && rows.length > 1 && (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMove(index, "up")}
                      aria-label="Move up"
                      className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-20 px-1"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={index === rows.length - 1}
                      onClick={() => handleMove(index, "down")}
                      aria-label="Move down"
                      className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-20 px-1"
                    >
                      ▼
                    </button>
                  </div>
                )}

                {config.allowRemove && (
                  <>
                    {confirmDeleteId === row.id ? (
                      <div className="flex items-center gap-1 bg-background border border-destructive/50 rounded px-1 shadow-sm">
                        <span className="text-[10px] text-destructive">Delete?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(row.id)}
                          className="text-[10px] font-bold text-destructive hover:underline"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[10px] text-muted-foreground hover:underline"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const hasData = Object.values(row.values).some((v) => v !== "" && v !== null && v !== 0 && v !== false);
                          if (hasData) {
                            setConfirmDeleteId(row.id);
                          } else {
                            handleDelete(row.id);
                          }
                        }}
                        aria-label={config.removeLabel || "Remove row"}
                        className="text-xs text-muted-foreground hover:text-destructive px-1.5 py-0.5 rounded"
                      >
                        ✕
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!isPrintOrReadonly && config.allowAdd && rows.length < config.maxRows && (
        <button
          type="button"
          onClick={handleAdd}
          className="self-start text-xs font-semibold text-primary hover:text-primary/80 border border-primary/30 hover:border-primary px-3 py-1 rounded-md transition-colors flex items-center gap-1"
        >
          <span>+</span>
          <span>{config.addLabel || "Add row"}</span>
        </button>
      )}
    </div>
  );
};
