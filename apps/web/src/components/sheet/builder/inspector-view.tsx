"use client";

import React, { useState } from "react";
import type {
  BoxProps,
  FillToken,
  LayoutAlign,
  LayoutDirection,
  LayoutJustify,
  LayoutNode,
  SheetFieldDefinition,
  SizingMode,
  StrokeToken,
  TargetLayoutKind,
} from "@mycharacter/contracts";
import {
  FILL_TOKENS,
  STROKE_TOKENS,
  TARGET_LAYOUT_KINDS,
} from "@mycharacter/contracts";
import { Plus } from "lucide-react";

interface InspectorViewProps {
  selectedNode: LayoutNode | null;
  onUpdateNode: (updated: LayoutNode) => void;
  onSaveAsComponent: (node: LayoutNode) => void;
  draftFields?: SheetFieldDefinition[];
  onUpdateDraftFields?: (fields: SheetFieldDefinition[]) => void;
}

export const InspectorView: React.FC<InspectorViewProps> = ({
  selectedNode,
  onUpdateNode,
  onSaveAsComponent,
  draftFields = [],
  onUpdateDraftFields,
}) => {
  const [linkPadding, setLinkPadding] = useState(true);
  const [linkStroke, setLinkStroke] = useState(true);
  const [linkRadius, setLinkRadius] = useState(true);
  const [showNewFieldModal, setShowNewFieldModal] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldKind, setNewFieldKind] = useState<SheetFieldDefinition["kind"]>("text");
  const [newFieldDefault, setNewFieldDefault] = useState("");

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

  const handleCreateField = (e: React.FormEvent) => {
    e.preventDefault();
    const key = newFieldKey.trim();
    if (!key || !onUpdateDraftFields) return;

    const newField: SheetFieldDefinition = {
      id: crypto.randomUUID(),
      key,
      label: newFieldLabel.trim() || key,
      kind: newFieldKind,
      options: [],
      readOnly: false,
      defaultValue:
        newFieldKind === "number"
          ? Number(newFieldDefault) || 0
          : newFieldKind === "checkbox"
            ? newFieldDefault === "true"
            : newFieldDefault,
    };

    const updated = [...draftFields.filter((f) => f.key !== key), newField];
    onUpdateDraftFields(updated);

    // Bind current node to this key
    if ("fieldBinding" in selectedNode) {
      onUpdateNode({
        ...selectedNode,
        fieldBinding: key,
        label: selectedNode.label || newField.label,
      } as LayoutNode);
    }

    setNewFieldKey("");
    setNewFieldLabel("");
    setNewFieldDefault("");
    setShowNewFieldModal(false);
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

      {/* Typography Controls for Text Node */}
      {selectedNode.kind === "text" && (
        <div className="flex flex-col gap-3 pb-3 border-b border-border">
          <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
            Typography & Font
          </h4>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Text Content</label>
            <input
              type="text"
              value={selectedNode.text}
              onChange={(e) => onUpdateNode({ ...selectedNode, text: e.target.value })}
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Font Family</label>
              <select
                value={selectedNode.fontFamily || "Noto Sans"}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    fontFamily: e.target.value as "Noto Sans" | "Montserrat Alternates",
                  })
                }
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              >
                <option value="Noto Sans">Noto Sans</option>
                <option value="Montserrat Alternates">Montserrat Alternates</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Weight</label>
              <select
                value={selectedNode.fontWeight || (selectedNode.weight === "bold" ? "700" : selectedNode.weight === "medium" ? "500" : "400")}
                onChange={(e) => {
                  const val = e.target.value as "400" | "500" | "600" | "700";
                  onUpdateNode({
                    ...selectedNode,
                    fontWeight: val,
                    weight: val === "700" ? "bold" : val === "500" || val === "600" ? "medium" : "normal",
                  });
                }}
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              >
                <option value="400">400 (Regular)</option>
                <option value="500">500 (Medium)</option>
                <option value="600">600 (SemiBold)</option>
                <option value="700">700 (Bold)</option>
              </select>
            </div>
          </div>

          {/* Font Size & Presets */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted-foreground">Font Size (px)</label>
              <span className="text-[10px] text-muted-foreground">{selectedNode.fontSize || 14}px</span>
            </div>
            <input
              type="number"
              min="6"
              max="120"
              value={selectedNode.fontSize || 14}
              onChange={(e) =>
                onUpdateNode({
                  ...selectedNode,
                  fontSize: Math.max(6, Math.min(120, Number(e.target.value) || 14)),
                })
              }
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
            />
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {[8, 10, 12, 14, 16, 18, 24, 32].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => onUpdateNode({ ...selectedNode, fontSize: sz })}
                  className={`px-1.5 py-0.5 rounded text-[10px] border ${
                    (selectedNode.fontSize || 14) === sz
                      ? "border-primary bg-primary/10 text-primary font-bold"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* Letter Spacing & Line Height */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium text-muted-foreground">Tracking (em)</label>
                <span className="text-[10px] text-muted-foreground">{selectedNode.letterSpacing ?? 0}em</span>
              </div>
              <input
                type="number"
                step="0.01"
                min="-0.20"
                max="0.20"
                value={selectedNode.letterSpacing ?? 0}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  const bounded = Math.max(-0.2, Math.min(0.2, val));
                  onUpdateNode({ ...selectedNode, letterSpacing: bounded });
                }}
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
              <div className="flex items-center gap-1 mt-1">
                {[-0.09, 0, 0.05].map((ls) => (
                  <button
                    key={ls}
                    type="button"
                    onClick={() => onUpdateNode({ ...selectedNode, letterSpacing: ls })}
                    className="px-1 py-0.5 rounded text-[9px] border border-border hover:bg-muted"
                  >
                    {ls}em
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium text-muted-foreground">Line Height</label>
                <span className="text-[10px] text-muted-foreground">{selectedNode.lineHeight ?? 1.2}</span>
              </div>
              <input
                type="number"
                step="0.1"
                min="0.8"
                max="3"
                value={selectedNode.lineHeight ?? 1.2}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    lineHeight: Math.max(0.8, Math.min(3, parseFloat(e.target.value) || 1.2)),
                  })
                }
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedNode.uppercase ?? false}
                onChange={(e) =>
                  onUpdateNode({ ...selectedNode, uppercase: e.target.checked })
                }
                className="rounded"
              />
              <span className="text-[11px]">Uppercase</span>
            </label>
          </div>
        </div>
      )}

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

      {/* Frame Corner & Edge Ornaments */}
      {selectedNode.kind === "frame" && (
        <div className="flex flex-col gap-3 pb-3 border-b border-border">
          <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
            Corner Ornaments (Fate Turnbacks)
          </h4>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Corner Style Preset</label>
            <select
              value={selectedNode.cornerOrnaments?.preset || "none"}
              onChange={(e) =>
                onUpdateNode({
                  ...selectedNode,
                  cornerOrnaments: {
                    preset: e.target.value as "none" | "fate-turnback" | "arc-corner",
                    topLeft: selectedNode.cornerOrnaments?.topLeft ?? true,
                    topRight: selectedNode.cornerOrnaments?.topRight ?? true,
                    bottomRight: selectedNode.cornerOrnaments?.bottomRight ?? true,
                    bottomLeft: selectedNode.cornerOrnaments?.bottomLeft ?? true,
                  },
                })
              }
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
            >
              <option value="none">None</option>
              <option value="fate-turnback">Fate Turnback (10x10)</option>
              <option value="arc-corner">Arc Corner (Legacy)</option>
            </select>
          </div>

          {selectedNode.cornerOrnaments?.preset && selectedNode.cornerOrnaments.preset !== "none" && (
            <div className="grid grid-cols-2 gap-2 pt-1 bg-muted/30 p-2 rounded">
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px]">
                <input
                  type="checkbox"
                  checked={selectedNode.cornerOrnaments?.topLeft ?? true}
                  onChange={(e) =>
                    onUpdateNode({
                      ...selectedNode,
                      cornerOrnaments: {
                        preset: selectedNode.cornerOrnaments?.preset ?? "fate-turnback",
                        topLeft: e.target.checked,
                        topRight: selectedNode.cornerOrnaments?.topRight ?? true,
                        bottomRight: selectedNode.cornerOrnaments?.bottomRight ?? true,
                        bottomLeft: selectedNode.cornerOrnaments?.bottomLeft ?? true,
                      },
                    })
                  }
                  className="rounded"
                />
                <span>Top-Left</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px]">
                <input
                  type="checkbox"
                  checked={selectedNode.cornerOrnaments?.topRight ?? true}
                  onChange={(e) =>
                    onUpdateNode({
                      ...selectedNode,
                      cornerOrnaments: {
                        preset: selectedNode.cornerOrnaments?.preset ?? "fate-turnback",
                        topLeft: selectedNode.cornerOrnaments?.topLeft ?? true,
                        topRight: e.target.checked,
                        bottomRight: selectedNode.cornerOrnaments?.bottomRight ?? true,
                        bottomLeft: selectedNode.cornerOrnaments?.bottomLeft ?? true,
                      },
                    })
                  }
                  className="rounded"
                />
                <span>Top-Right</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px]">
                <input
                  type="checkbox"
                  checked={selectedNode.cornerOrnaments?.bottomLeft ?? true}
                  onChange={(e) =>
                    onUpdateNode({
                      ...selectedNode,
                      cornerOrnaments: {
                        preset: selectedNode.cornerOrnaments?.preset ?? "fate-turnback",
                        topLeft: selectedNode.cornerOrnaments?.topLeft ?? true,
                        topRight: selectedNode.cornerOrnaments?.topRight ?? true,
                        bottomRight: selectedNode.cornerOrnaments?.bottomRight ?? true,
                        bottomLeft: e.target.checked,
                      },
                    })
                  }
                  className="rounded"
                />
                <span>Bottom-Left</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px]">
                <input
                  type="checkbox"
                  checked={selectedNode.cornerOrnaments?.bottomRight ?? true}
                  onChange={(e) =>
                    onUpdateNode({
                      ...selectedNode,
                      cornerOrnaments: {
                        preset: selectedNode.cornerOrnaments?.preset ?? "fate-turnback",
                        topLeft: selectedNode.cornerOrnaments?.topLeft ?? true,
                        topRight: selectedNode.cornerOrnaments?.topRight ?? true,
                        bottomRight: e.target.checked,
                        bottomLeft: selectedNode.cornerOrnaments?.bottomLeft ?? true,
                      },
                    })
                  }
                  className="rounded"
                />
                <span>Bottom-Right</span>
              </label>
            </div>
          )}

          {/* Top Title Ornament */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
            <h5 className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
              Top Title Ornament
            </h5>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">Preset</label>
                <select
                  value={selectedNode.topOrnament?.preset || "none"}
                  onChange={(e) =>
                    onUpdateNode({
                      ...selectedNode,
                      topOrnament: {
                        preset: e.target.value as "none" | "fate" | "dnd" | "legacy-pill",
                        align: selectedNode.topOrnament?.align || "center",
                        offset: selectedNode.topOrnament?.offset || 0,
                        text: selectedNode.topOrnament?.text || "",
                        fontFamily: selectedNode.topOrnament?.fontFamily || "Montserrat Alternates",
                        fontSize: selectedNode.topOrnament?.fontSize || 10,
                        fontWeight: selectedNode.topOrnament?.fontWeight || "medium",
                        letterSpacingPx: selectedNode.topOrnament?.letterSpacingPx ?? -0.9,
                      },
                    })
                  }
                  className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
                >
                  <option value="none">None</option>
                  <option value="fate">Fate Core Badge</option>
                  <option value="dnd">D&D Faceted Badge</option>
                  <option value="legacy-pill">Plain Pill</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-medium text-muted-foreground">Alignment</label>
                <select
                  value={selectedNode.topOrnament?.align || "center"}
                  onChange={(e) =>
                    onUpdateNode({
                      ...selectedNode,
                      topOrnament: {
                        preset: selectedNode.topOrnament?.preset || "fate",
                        align: e.target.value as "start" | "center" | "end",
                        offset: selectedNode.topOrnament?.offset || 0,
                        text: selectedNode.topOrnament?.text || "",
                        fontFamily: selectedNode.topOrnament?.fontFamily || "Montserrat Alternates",
                        fontSize: selectedNode.topOrnament?.fontSize || 10,
                        fontWeight: selectedNode.topOrnament?.fontWeight || "medium",
                        letterSpacingPx: selectedNode.topOrnament?.letterSpacingPx ?? -0.9,
                      },
                    })
                  }
                  className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
                >
                  <option value="start">Start</option>
                  <option value="center">Center</option>
                  <option value="end">End</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Title Text</label>
              <input
                type="text"
                value={selectedNode.topOrnament?.text || ""}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    topOrnament: {
                      preset: selectedNode.topOrnament?.preset || "fate",
                      align: selectedNode.topOrnament?.align || "center",
                      offset: selectedNode.topOrnament?.offset || 0,
                      text: e.target.value,
                      fontFamily: selectedNode.topOrnament?.fontFamily || "Montserrat Alternates",
                      fontSize: selectedNode.topOrnament?.fontSize || 10,
                      fontWeight: selectedNode.topOrnament?.fontWeight || "medium",
                      letterSpacingPx: selectedNode.topOrnament?.letterSpacingPx ?? -0.9,
                    },
                  })
                }
                placeholder="e.g. ASPECTS or SKILLS"
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded uppercase"
              />
            </div>

            {selectedNode.topOrnament?.preset && selectedNode.topOrnament.preset !== "none" && (
              <div className="grid grid-cols-2 gap-2 bg-muted/20 p-2 rounded">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Font Size (px)</label>
                  <input
                    type="number"
                    min="6"
                    max="48"
                    value={selectedNode.topOrnament?.fontSize || 10}
                    onChange={(e) =>
                      onUpdateNode({
                        ...selectedNode,
                        topOrnament: {
                          preset: selectedNode.topOrnament?.preset || "fate",
                          align: selectedNode.topOrnament?.align || "center",
                          offset: selectedNode.topOrnament?.offset || 0,
                          text: selectedNode.topOrnament?.text || "",
                          fontFamily: selectedNode.topOrnament?.fontFamily || "Montserrat Alternates",
                          fontSize: Number(e.target.value) || 10,
                          fontWeight: selectedNode.topOrnament?.fontWeight || "medium",
                          letterSpacingPx: selectedNode.topOrnament?.letterSpacingPx ?? -0.9,
                        },
                      })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Tracking (px)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="-5"
                    max="10"
                    value={selectedNode.topOrnament?.letterSpacingPx ?? -0.9}
                    onChange={(e) =>
                      onUpdateNode({
                        ...selectedNode,
                        topOrnament: {
                          preset: selectedNode.topOrnament?.preset || "fate",
                          align: selectedNode.topOrnament?.align || "center",
                          offset: selectedNode.topOrnament?.offset || 0,
                          text: selectedNode.topOrnament?.text || "",
                          fontFamily: selectedNode.topOrnament?.fontFamily || "Montserrat Alternates",
                          fontSize: selectedNode.topOrnament?.fontSize || 10,
                          fontWeight: selectedNode.topOrnament?.fontWeight || "medium",
                          letterSpacingPx: parseFloat(e.target.value) || -0.9,
                        },
                      })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Bottom Title Ornament */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
            <h5 className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
              Bottom Edge Ornament
            </h5>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">Preset</label>
                <select
                  value={selectedNode.bottomOrnament?.preset || "none"}
                  onChange={(e) =>
                    onUpdateNode({
                      ...selectedNode,
                      bottomOrnament: {
                        preset: e.target.value as "none" | "fate" | "dnd" | "legacy-pill",
                        align: selectedNode.bottomOrnament?.align || "center",
                        offset: selectedNode.bottomOrnament?.offset || 0,
                        text: selectedNode.bottomOrnament?.text || "",
                        fontFamily: selectedNode.bottomOrnament?.fontFamily || "Montserrat Alternates",
                        fontSize: selectedNode.bottomOrnament?.fontSize || 10,
                        fontWeight: selectedNode.bottomOrnament?.fontWeight || "medium",
                        letterSpacingPx: selectedNode.bottomOrnament?.letterSpacingPx ?? -0.9,
                      },
                    })
                  }
                  className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
                >
                  <option value="none">None</option>
                  <option value="fate">Fate Core Badge</option>
                  <option value="dnd">D&D Faceted Badge</option>
                  <option value="legacy-pill">Plain Pill</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-medium text-muted-foreground">Alignment</label>
                <select
                  value={selectedNode.bottomOrnament?.align || "center"}
                  onChange={(e) =>
                    onUpdateNode({
                      ...selectedNode,
                      bottomOrnament: {
                        preset: selectedNode.bottomOrnament?.preset || "fate",
                        align: e.target.value as "start" | "center" | "end",
                        offset: selectedNode.bottomOrnament?.offset || 0,
                        text: selectedNode.bottomOrnament?.text || "",
                        fontFamily: selectedNode.bottomOrnament?.fontFamily || "Montserrat Alternates",
                        fontSize: selectedNode.bottomOrnament?.fontSize || 10,
                        fontWeight: selectedNode.bottomOrnament?.fontWeight || "medium",
                        letterSpacingPx: selectedNode.bottomOrnament?.letterSpacingPx ?? -0.9,
                      },
                    })
                  }
                  className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
                >
                  <option value="start">Start</option>
                  <option value="center">Center</option>
                  <option value="end">End</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Footer Text</label>
              <input
                type="text"
                value={selectedNode.bottomOrnament?.text || ""}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    bottomOrnament: {
                      preset: selectedNode.bottomOrnament?.preset || "fate",
                      align: selectedNode.bottomOrnament?.align || "center",
                      offset: selectedNode.bottomOrnament?.offset || 0,
                      text: e.target.value,
                      fontFamily: selectedNode.bottomOrnament?.fontFamily || "Montserrat Alternates",
                      fontSize: selectedNode.bottomOrnament?.fontSize || 10,
                      fontWeight: selectedNode.bottomOrnament?.fontWeight || "medium",
                      letterSpacingPx: selectedNode.bottomOrnament?.letterSpacingPx ?? -0.9,
                    },
                  })
                }
                placeholder="Footer note…"
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
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
              Semantic Field Binding
            </h4>
            <button
              type="button"
              onClick={() => setShowNewFieldModal(true)}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
            >
              <Plus className="size-3" /> New Field
            </button>
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Bound Field Key</label>
            <div className="flex items-center gap-1 mt-0.5">
              <select
                value={selectedNode.fieldBinding || ""}
                onChange={(e) => {
                  const key = e.target.value;
                  const fieldDef = draftFields.find((f) => f.key === key);
                  onUpdateNode({
                    ...selectedNode,
                    fieldBinding: key,
                    label: selectedNode.label || fieldDef?.label,
                  } as LayoutNode);
                }}
                className="w-full px-2 py-1 bg-background border border-border rounded font-mono"
              >
                <option value="">-- Choose Field --</option>
                {draftFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label} ({f.key}) [{f.kind}]
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="Or type custom key..."
              value={selectedNode.fieldBinding || ""}
              onChange={(e) =>
                onUpdateNode({ ...selectedNode, fieldBinding: e.target.value } as LayoutNode)
              }
              className="w-full mt-1 px-2 py-1 bg-background border border-border rounded font-mono text-[11px]"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Widget Label</label>
            <input
              type="text"
              value={selectedNode.label || ""}
              onChange={(e) =>
                onUpdateNode({ ...selectedNode, label: e.target.value } as LayoutNode)
              }
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
            />
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedNode.readOnly ?? false}
              onChange={(e) =>
                onUpdateNode({ ...selectedNode, readOnly: e.target.checked } as LayoutNode)
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
          </div>

          {selectedNode.box.width.mode === "fixed" && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Fixed Width</label>
              <input
                type="number"
                min="10"
                value={selectedNode.box.width.value}
                onChange={(e) =>
                  updateBox({
                    width: { mode: "fixed", value: Number(e.target.value) || 10 },
                  })
                }
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
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
          </div>

          {selectedNode.box.height.mode === "fixed" && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Fixed Height</label>
              <input
                type="number"
                min="10"
                value={selectedNode.box.height.value}
                onChange={(e) =>
                  updateBox({
                    height: { mode: "fixed", value: Number(e.target.value) || 10 },
                  })
                }
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>
          )}
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

      {/* Modal for Creating New Semantic Field */}
      {showNewFieldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-border bg-card p-5 shadow-lg">
            <h3 className="text-sm font-bold">New Semantic Field Definition</h3>
            <form onSubmit={handleCreateField} className="mt-3 space-y-3">
              <div>
                <label className="text-[11px] font-medium">Field Key *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. strength, armor_class"
                  value={newFieldKey}
                  onChange={(e) => setNewFieldKey(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 bg-background border border-border rounded text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium">Label</label>
                <input
                  type="text"
                  placeholder="e.g. Strength, Armor Class"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 bg-background border border-border rounded text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium">Kind</label>
                  <select
                    value={newFieldKind}
                    onChange={(e) =>
                      setNewFieldKind(
                        e.target.value as SheetFieldDefinition["kind"],
                      )
                    }
                    className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded text-xs"
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="select">Select</option>
                    <option value="multiline">Multiline</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium">Default Value</label>
                  <input
                    type="text"
                    placeholder="Optional default"
                    value={newFieldDefault}
                    onChange={(e) => setNewFieldDefault(e.target.value)}
                    className="w-full mt-1 px-2.5 py-1.5 bg-background border border-border rounded text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewFieldModal(false)}
                  className="px-3 py-1.5 text-xs rounded border border-border hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFieldKey.trim()}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Save & Bind
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
