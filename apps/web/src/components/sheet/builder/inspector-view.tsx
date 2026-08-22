"use client";

import React, { useState } from "react";
import type {
  BoxProps,
  FillToken,
  LayoutAlign,
  LayoutDirection,
  LayoutJustify,
  LayoutNode,
  OrnamentStyle,
  SizingMode,
  StrokeToken,
  TargetLayoutKind,
  TitleDockVariant,
} from "@mycharacter/contracts";
import {
  FILL_TOKENS,
  ORNAMENT_STYLES,
  STROKE_TOKENS,
  TARGET_LAYOUT_KINDS,
  TITLE_DOCK_VARIANTS,
} from "@mycharacter/contracts";

interface InspectorViewProps {
  selectedNode: LayoutNode | null;
  onUpdateNode: (updated: LayoutNode) => void;
  onSaveAsComponent: (node: LayoutNode) => void;
}

export const InspectorView: React.FC<InspectorViewProps> = ({
  selectedNode,
  onUpdateNode,
  onSaveAsComponent,
}) => {
  const [linkPadding, setLinkPadding] = useState(true);
  const [linkStroke, setLinkStroke] = useState(true);
  const [linkRadius, setLinkRadius] = useState(true);

  if (!selectedNode) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground italic">
        Select an element on the canvas or layers tree to inspect properties.
      </div>
    );
  }

  const updateBox = (partial: Partial<BoxProps>) => {
    onUpdateNode({
      ...selectedNode,
      box: {
        ...selectedNode.box,
        ...partial,
      },
    });
  };

  const toggleTargetVisibility = (target: TargetLayoutKind) => {
    const current = selectedNode.box.hiddenOnTargets ?? [];
    const next = current.includes(target)
      ? current.filter((t) => t !== target)
      : [...current, target];
    updateBox({ hiddenOnTargets: next });
  };

  return (
    <div className="flex flex-col gap-5 p-3 overflow-y-auto max-h-[calc(100vh-280px)] text-xs text-foreground">
      {/* Node Info & Name */}
      <div className="flex flex-col gap-2 pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <span className="font-bold uppercase tracking-wider text-[11px] text-muted-foreground">
            {selectedNode.kind}
          </span>
          <button
            type="button"
            onClick={() => onSaveAsComponent(selectedNode)}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            Save as Component…
          </button>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Name</label>
          <input
            type="text"
            value={selectedNode.name || ""}
            onChange={(e) => onUpdateNode({ ...selectedNode, name: e.target.value })}
            placeholder={selectedNode.kind}
            className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
          />
        </div>
      </div>

      {/* Frame Auto Layout Controls */}
      {selectedNode.kind === "frame" && (
        <div className="flex flex-col gap-3 pb-3 border-b border-border">
          <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
            Auto Layout
          </h4>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Direction</label>
              <select
                value={selectedNode.direction}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    direction: e.target.value as LayoutDirection,
                  })
                }
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              >
                <option value="vertical">Vertical (Column)</option>
                <option value="horizontal">Horizontal (Row)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Gap (px)</label>
              <input
                type="number"
                min="0"
                max="200"
                value={selectedNode.gap ?? 0}
                onChange={(e) =>
                  onUpdateNode({ ...selectedNode, gap: Number(e.target.value) || 0 })
                }
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Align Items</label>
              <select
                value={selectedNode.align}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    align: e.target.value as LayoutAlign,
                  })
                }
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              >
                <option value="start">Start</option>
                <option value="center">Center</option>
                <option value="end">End</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Justify</label>
              <select
                value={selectedNode.justify}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    justify: e.target.value as LayoutJustify,
                  })
                }
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              >
                <option value="start">Start</option>
                <option value="center">Center</option>
                <option value="end">End</option>
                <option value="space-between">Space Between</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedNode.wrap ?? false}
                onChange={(e) =>
                  onUpdateNode({ ...selectedNode, wrap: e.target.checked })
                }
                className="rounded"
              />
              <span className="text-[11px]">Wrap</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedNode.collapseAdjacentStrokes ?? false}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    collapseAdjacentStrokes: e.target.checked,
                  })
                }
                className="rounded"
              />
              <span className="text-[11px]">Collapse Strokes</span>
            </label>
          </div>
        </div>
      )}

      {/* Frame Decorator & Docks */}
      {selectedNode.kind === "frame" && (
        <div className="flex flex-col gap-3 pb-3 border-b border-border">
          <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
            Decoration & Docks
          </h4>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Ornament Style</label>
            <select
              value={selectedNode.ornamentStyle}
              onChange={(e) =>
                onUpdateNode({
                  ...selectedNode,
                  ornamentStyle: e.target.value as OrnamentStyle,
                })
              }
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded capitalize"
            >
              {ORNAMENT_STYLES.map((st) => (
                <option key={st} value={st}>
                  {st.replace("-", " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Header Dock</label>
              <select
                value={selectedNode.titleDock?.variant || "none"}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    titleDock: {
                      dock: e.target.value === "none" ? "none" : "top",
                      variant: e.target.value as TitleDockVariant,
                      text: selectedNode.titleDock?.text || "",
                    },
                  })
                }
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              >
                {TITLE_DOCK_VARIANTS.map((v) => (
                  <option key={v} value={v}>
                    {v.replace("-", " ")}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Dock Text</label>
              <input
                type="text"
                value={selectedNode.titleDock?.text || ""}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    titleDock: {
                      dock: selectedNode.titleDock?.dock || "top",
                      variant: selectedNode.titleDock?.variant || "inline-center",
                      text: e.target.value,
                    },
                  })
                }
                placeholder="Title label…"
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>
          </div>
        </div>
      )}

      {/* Field Binding & Widget Settings */}
      {(selectedNode.kind === "field-input" ||
        selectedNode.kind === "number-input" ||
        selectedNode.kind === "textarea" ||
        selectedNode.kind === "checkbox" ||
        selectedNode.kind === "select") && (
        <div className="flex flex-col gap-3 pb-3 border-b border-border">
          <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
            Field Binding
          </h4>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Field Binding Key</label>
            <input
              type="text"
              value={selectedNode.fieldBinding}
              onChange={(e) =>
                onUpdateNode({ ...selectedNode, fieldBinding: e.target.value })
              }
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded font-mono"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Label</label>
            <input
              type="text"
              value={selectedNode.label || ""}
              onChange={(e) =>
                onUpdateNode({ ...selectedNode, label: e.target.value })
              }
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
            />
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedNode.readOnly ?? false}
              onChange={(e) =>
                onUpdateNode({ ...selectedNode, readOnly: e.target.checked })
              }
              className="rounded"
            />
            <span className="text-[11px]">Read-only display</span>
          </label>
        </div>
      )}

      {/* Sizing & Dimensions */}
      <div className="flex flex-col gap-3 pb-3 border-b border-border">
        <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
          Dimensions & Sizing
        </h4>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Width</label>
            <select
              value={selectedNode.box.width.mode}
              onChange={(e) => {
                const mode = e.target.value as SizingMode;
                updateBox({
                  width: mode === "fixed" ? { mode: "fixed", value: 120 } : { mode },
                });
              }}
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
            >
              <option value="fill">Fill Container</option>
              <option value="hug">Hug Contents</option>
              <option value="fixed">Fixed (px)</option>
            </select>
            {selectedNode.box.width.mode === "fixed" && (
              <input
                type="number"
                value={selectedNode.box.width.value}
                onChange={(e) =>
                  updateBox({
                    width: { mode: "fixed", value: Number(e.target.value) || 10 },
                  })
                }
                className="w-full mt-1 px-2 py-1 bg-background border border-border rounded"
              />
            )}
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Height</label>
            <select
              value={selectedNode.box.height.mode}
              onChange={(e) => {
                const mode = e.target.value as SizingMode;
                updateBox({
                  height: mode === "fixed" ? { mode: "fixed", value: 40 } : { mode },
                });
              }}
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
            >
              <option value="hug">Hug Contents</option>
              <option value="fill">Fill Container</option>
              <option value="fixed">Fixed (px)</option>
            </select>
            {selectedNode.box.height.mode === "fixed" && (
              <input
                type="number"
                value={selectedNode.box.height.value}
                onChange={(e) =>
                  updateBox({
                    height: { mode: "fixed", value: Number(e.target.value) || 10 },
                  })
                }
                className="w-full mt-1 px-2 py-1 bg-background border border-border rounded"
              />
            )}
          </div>
        </div>

        {/* 4-side Padding */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground">Padding</span>
            <button
              type="button"
              onClick={() => setLinkPadding(!linkPadding)}
              className="text-[10px] text-primary hover:underline"
            >
              {linkPadding ? "Unlink" : "Link"}
            </button>
          </div>
          {linkPadding ? (
            <input
              type="number"
              min="0"
              value={selectedNode.box.padding.top}
              onChange={(e) => {
                const val = Number(e.target.value) || 0;
                updateBox({ padding: { top: val, right: val, bottom: val, left: val } });
              }}
              className="w-full px-2 py-1 bg-background border border-border rounded"
            />
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <div key={side}>
                  <span className="text-[9px] uppercase text-muted-foreground">{side[0]}</span>
                  <input
                    type="number"
                    min="0"
                    value={selectedNode.box.padding[side]}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      updateBox({
                        padding: { ...selectedNode.box.padding, [side]: val },
                      });
                    }}
                    className="w-full px-1 py-0.5 bg-background border border-border rounded text-center"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4-side Stroke */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground">Border Stroke</span>
            <button
              type="button"
              onClick={() => setLinkStroke(!linkStroke)}
              className="text-[10px] text-primary hover:underline"
            >
              {linkStroke ? "Unlink" : "Link"}
            </button>
          </div>
          {linkStroke ? (
            <input
              type="number"
              min="0"
              value={selectedNode.box.strokeWidth.top}
              onChange={(e) => {
                const val = Number(e.target.value) || 0;
                updateBox({ strokeWidth: { top: val, right: val, bottom: val, left: val } });
              }}
              className="w-full px-2 py-1 bg-background border border-border rounded"
            />
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <div key={side}>
                  <span className="text-[9px] uppercase text-muted-foreground">{side[0]}</span>
                  <input
                    type="number"
                    min="0"
                    value={selectedNode.box.strokeWidth[side]}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      updateBox({
                        strokeWidth: { ...selectedNode.box.strokeWidth, [side]: val },
                      });
                    }}
                    className="w-full px-1 py-0.5 bg-background border border-border rounded text-center"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4-corner Radius */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground">Corner Radius</span>
            <button
              type="button"
              onClick={() => setLinkRadius(!linkRadius)}
              className="text-[10px] text-primary hover:underline"
            >
              {linkRadius ? "Unlink" : "Link"}
            </button>
          </div>
          {linkRadius ? (
            <input
              type="number"
              min="0"
              value={selectedNode.box.cornerRadius.topLeft}
              onChange={(e) => {
                const val = Number(e.target.value) || 0;
                updateBox({ cornerRadius: { topLeft: val, topRight: val, bottomRight: val, bottomLeft: val } });
              }}
              className="w-full px-2 py-1 bg-background border border-border rounded"
            />
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {(["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).map((c, idx) => (
                <div key={c}>
                  <span className="text-[9px] uppercase text-muted-foreground">C{idx + 1}</span>
                  <input
                    type="number"
                    min="0"
                    value={selectedNode.box.cornerRadius[c]}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      updateBox({
                        cornerRadius: { ...selectedNode.box.cornerRadius, [c]: val },
                      });
                    }}
                    className="w-full px-1 py-0.5 bg-background border border-border rounded text-center"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Color Tokens */}
      <div className="flex flex-col gap-3 pb-3 border-b border-border">
        <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
          Colors & Fill
        </h4>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Fill Token</label>
            <select
              value={selectedNode.box.fill}
              onChange={(e) => updateBox({ fill: e.target.value as FillToken })}
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded capitalize"
            >
              {FILL_TOKENS.map((f) => (
                <option key={f} value={f}>
                  {f.replace("-", " ")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Stroke Token</label>
            <select
              value={selectedNode.box.strokeColor}
              onChange={(e) => updateBox({ strokeColor: e.target.value as StrokeToken })}
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded capitalize"
            >
              {STROKE_TOKENS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Responsive Target Visibility */}
      <div className="flex flex-col gap-2">
        <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
          Target Visibility
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {TARGET_LAYOUT_KINDS.map((t) => {
            const isHidden = selectedNode.box.hiddenOnTargets?.includes(t);
            return (
              <label
                key={t}
                className="flex items-center gap-1.5 p-1.5 rounded border border-border bg-card cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => toggleTargetVisibility(t)}
                  className="rounded"
                />
                <span className="text-xs capitalize">{t}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
};
