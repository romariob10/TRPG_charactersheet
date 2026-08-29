"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import type {
  BoxProps,
  FillToken,
  LayoutAlign,
  LayoutDirection,
  LayoutJustify,
  LayoutNode,
  SheetFieldDefinition,
  SystemMaterial,
  SizingMode,
  StrokeToken,
  TargetLayoutKind,
} from "@mycharacter/contracts";
import {
  FILL_TOKENS,
  STROKE_TOKENS,
} from "@mycharacter/contracts";
import { Plus } from "lucide-react";

const VISIBLE_TARGET_LAYOUT_KINDS = [
  "mobile",
  "desktop",
  "print",
] as const satisfies readonly TargetLayoutKind[];

interface InspectorViewProps {
  selectedNode: LayoutNode | null;
  onUpdateNode: (updated: LayoutNode) => void;
  onSaveAsComponent: (node: LayoutNode) => void;
  draftFields?: SheetFieldDefinition[];
  onUpdateDraftFields?: (fields: SheetFieldDefinition[]) => void;
  systemId: string;
}

function CommitNumberInput({
  value,
  onCommit,
  min,
  max,
  step,
  className,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const commit = (input: HTMLInputElement) => {
    const parsed = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(parsed)) {
      input.value = String(value);
      return;
    }
    const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    input.value = String(next);
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="number"
      key={value}
      defaultValue={value}
      min={min}
      max={max}
      step={step}
      onBlur={(event) => commit(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = String(value);
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

export const InspectorView: React.FC<InspectorViewProps> = ({
  selectedNode,
  onUpdateNode,
  onSaveAsComponent,
  draftFields = [],
  onUpdateDraftFields,
  systemId,
}) => {
  const t = useTranslations("Inspector");
  const [linkPadding, setLinkPadding] = useState(true);
  const [linkStroke, setLinkStroke] = useState(true);
  const [linkRadius, setLinkRadius] = useState(true);
  const [showNewFieldModal, setShowNewFieldModal] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldKind, setNewFieldKind] = useState<SheetFieldDefinition["kind"]>("text");
  const [newFieldDefault, setNewFieldDefault] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  if (!selectedNode) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground italic">
        {t("noSelection")}
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

  const handleImageUpload = async (file: File) => {
    if (selectedNode.kind !== "image") return;
    setUploadingImage(true);
    setImageUploadError(null);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("title", file.name);
    try {
      const response = await fetch(`/api/systems/${systemId}/materials`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(t("imageUploadFailed"));
      const material = (await response.json()) as SystemMaterial;
      if (material.fileType !== "image") throw new Error(t("imageUploadFailed"));
      onUpdateNode({ ...selectedNode, url: material.url, alt: file.name });
    } catch (error) {
      setImageUploadError(error instanceof Error ? error.message : t("imageUploadFailed"));
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3 text-xs text-foreground">
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
            {t("saveAsComponent")}
          </button>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">{t("name")}</label>
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
            {t("typography")}
          </h4>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t("textContent")}</label>
            <input
              type="text"
              value={selectedNode.text}
              onChange={(e) => onUpdateNode({ ...selectedNode, text: e.target.value })}
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("fontFamily")}</label>
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
              <label className="text-[10px] font-medium text-muted-foreground">{t("fontWeight")}</label>
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
                <option value="400">{t("weightNormal")}</option>
                <option value="500">{t("weightMedium")}</option>
                <option value="600">{t("weightSemibold")}</option>
                <option value="700">{t("weightBold")}</option>
              </select>
            </div>
          </div>

          {/* Font Size & Presets */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted-foreground">{t("fontSize")}</label>
              <span className="text-[10px] text-muted-foreground">{selectedNode.fontSize || 14}px</span>
            </div>
            <CommitNumberInput
              min={6}
              max={120}
              value={selectedNode.fontSize || 14}
              onCommit={(fontSize) => onUpdateNode({ ...selectedNode, fontSize })}
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
                <label className="text-[10px] font-medium text-muted-foreground">{t("trackingEm")}</label>
                <span className="text-[10px] text-muted-foreground">{selectedNode.letterSpacing ?? 0}em</span>
              </div>
              <CommitNumberInput
                step={0.01}
                min={-0.2}
                max={0.2}
                value={selectedNode.letterSpacing ?? 0}
                onCommit={(letterSpacing) => onUpdateNode({ ...selectedNode, letterSpacing })}
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
                <label className="text-[10px] font-medium text-muted-foreground">{t("lineHeight")}</label>
                <span className="text-[10px] text-muted-foreground">{selectedNode.lineHeight ?? 1.2}</span>
              </div>
              <CommitNumberInput
                step={0.1}
                min={0.8}
                max={2.5}
                value={selectedNode.lineHeight ?? 1.2}
                onCommit={(lineHeight) => onUpdateNode({ ...selectedNode, lineHeight })}
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
              <span className="text-[11px]">{t("uppercase")}</span>
            </label>
          </div>
        </div>
      )}

      {/* Frame Auto Layout Controls */}
      {selectedNode.kind === "frame" && (
        <div className="flex flex-col gap-3 pb-3 border-b border-border">
          <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
            {t("layoutSection")}
          </h4>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("direction")}</label>
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
                <option value="vertical">{t("directionVertical")}</option>
                <option value="horizontal">{t("directionHorizontal")}</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("gap")}</label>
              <CommitNumberInput
                min={0}
                max={200}
                value={selectedNode.gap ?? 0}
                onCommit={(gap) => onUpdateNode({ ...selectedNode, gap })}
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("alignment")}</label>
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
                <option value="start">{t("alignStart")}</option>
                <option value="center">{t("alignCenter")}</option>
                <option value="end">{t("alignEnd")}</option>
                <option value="stretch">{t("alignStretch")}</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("justify")}</label>
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
                <option value="start">{t("justifyStart")}</option>
                <option value="center">{t("justifyCenter")}</option>
                <option value="end">{t("justifyEnd")}</option>
                <option value="space-between">{t("justifyBetween")}</option>
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
              <span className="text-[11px]">{t("wrap")}</span>
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
              <span className="text-[11px]">{t("collapseStrokes")}</span>
            </label>
          </div>
        </div>
      )}

      {/* Frame Corner & Edge Ornaments */}
      {selectedNode.kind === "frame" && (
        <div className="flex flex-col gap-3 pb-3 border-b border-border">
          <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
            {t("cornerOrnamentsSection")}
          </h4>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t("cornerPreset")}</label>
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
              <option value="none">{t("presetNone")}</option>
              <option value="fate-turnback">{t("presetFateTurnback")}</option>
              <option value="arc-corner">{t("presetArcCorner")}</option>
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
                <span>{t("cornerTopLeft")}</span>
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
                <span>{t("cornerTopRight")}</span>
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
                <span>{t("cornerBottomLeft")}</span>
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
                <span>{t("cornerBottomRight")}</span>
              </label>
            </div>
          )}

          {/* Top Title Ornament */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
            <h5 className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
              {t("topOrnament")}
            </h5>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">{t("edgePreset")}</label>
                <select
                  value={selectedNode.topOrnament?.preset || "none"}
                  onChange={(e) =>
                    onUpdateNode({
                      ...selectedNode,
                      topOrnament: {
                        preset: e.target.value as "none" | "fate" | "dnd-chevron" | "dnd-diamond" | "legacy-pill",
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
                  <option value="none">{t("presetNone")}</option>
                  <option value="fate">{t("presetFate")}</option>
                  <option value="dnd-chevron">{t("presetDndChevron")}</option>
                  <option value="dnd-diamond">{t("presetDndDiamond")}</option>
                  <option value="legacy-pill">{t("presetLegacyPill")}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-medium text-muted-foreground">{t("edgeAlign")}</label>
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
                  <option value="start">{t("alignStart")}</option>
                  <option value="center">{t("alignCenter")}</option>
                  <option value="end">{t("alignEnd")}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("edgeText")}</label>
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
                placeholder={t("edgeTextPlaceholder")}
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>

            {selectedNode.topOrnament?.preset && selectedNode.topOrnament.preset !== "none" && (
              <div className="grid grid-cols-2 gap-2 bg-muted/20 p-2 rounded">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">{t("fontSize")}</label>
                  <CommitNumberInput
                    min={6}
                    max={48}
                    value={selectedNode.topOrnament?.fontSize || 10}
                    onCommit={(fontSize) =>
                      onUpdateNode({
                        ...selectedNode,
                        topOrnament: {
                          preset: selectedNode.topOrnament?.preset || "fate",
                          align: selectedNode.topOrnament?.align || "center",
                          offset: selectedNode.topOrnament?.offset || 0,
                          text: selectedNode.topOrnament?.text || "",
                          fontFamily: selectedNode.topOrnament?.fontFamily || "Montserrat Alternates",
                          fontSize,
                          fontWeight: selectedNode.topOrnament?.fontWeight || "medium",
                          letterSpacingPx: selectedNode.topOrnament?.letterSpacingPx ?? -0.9,
                        },
                      })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">{t("letterSpacingPx")}</label>
                  <CommitNumberInput
                    step={0.1}
                    min={-5}
                    max={10}
                    value={selectedNode.topOrnament?.letterSpacingPx ?? -0.9}
                    onCommit={(letterSpacingPx) =>
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
                          letterSpacingPx,
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
              {t("bottomOrnament")}
            </h5>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">{t("edgePreset")}</label>
                <select
                  value={selectedNode.bottomOrnament?.preset || "none"}
                  onChange={(e) =>
                    onUpdateNode({
                      ...selectedNode,
                      bottomOrnament: {
                        preset: e.target.value as "none" | "fate" | "dnd-chevron" | "dnd-diamond" | "legacy-pill",
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
                  <option value="none">{t("presetNone")}</option>
                  <option value="fate">{t("presetFate")}</option>
                  <option value="dnd-chevron">{t("presetDndChevron")}</option>
                  <option value="dnd-diamond">{t("presetDndDiamond")}</option>
                  <option value="legacy-pill">{t("presetLegacyPill")}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-medium text-muted-foreground">{t("edgeAlign")}</label>
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
                  <option value="start">{t("alignStart")}</option>
                  <option value="center">{t("alignCenter")}</option>
                  <option value="end">{t("alignEnd")}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("footerText")}</label>
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
                placeholder={t("footerTextPlaceholder")}
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
              {t("fieldBindingSection")}
            </h4>
            <button
              type="button"
              onClick={() => setShowNewFieldModal(true)}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
            >
              <Plus className="size-3" /> {t("createNewField")}
            </button>
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t("bindField")}</label>
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
                <option value="">{t("noBinding")}</option>
                {draftFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label} ({f.key}) [{f.kind}]
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              placeholder={t("customFieldKeyPlaceholder")}
              value={selectedNode.fieldBinding || ""}
              onChange={(e) =>
                onUpdateNode({ ...selectedNode, fieldBinding: e.target.value } as LayoutNode)
              }
              className="w-full mt-1 px-2 py-1 bg-background border border-border rounded font-mono text-[11px]"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t("fieldLabel")}</label>
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
            <span className="text-[11px]">{t("readOnly")}</span>
          </label>
        </div>
      )}

      {selectedNode.kind === "checkbox" && (
        <label className="flex items-center gap-1.5 border-b border-border pb-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={selectedNode.showBorder !== false}
            onChange={(event) => onUpdateNode({ ...selectedNode, showBorder: event.target.checked })}
            className="rounded"
          />
          <span className="text-[11px]">{t("showCheckboxBorder")}</span>
        </label>
      )}

      {selectedNode.kind === "image" && (
        <div className="flex flex-col gap-3 border-b border-border pb-3">
          <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
            {t("imageSection")}
          </h4>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploadingImage}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImageUpload(file);
              event.currentTarget.value = "";
            }}
            className="w-full text-[11px] file:mr-2 file:rounded file:border-0 file:bg-primary file:px-2 file:py-1 file:text-primary-foreground"
          />
          {uploadingImage && <span className="text-[11px] text-muted-foreground">{t("uploadingImage")}</span>}
          {imageUploadError && <span className="text-[11px] text-destructive">{imageUploadError}</span>}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t("imageFit")}</label>
            <select
              value={selectedNode.fit}
              onChange={(event) => onUpdateNode({ ...selectedNode, fit: event.target.value as "cover" | "contain" | "fill" })}
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
            >
              <option value="contain">{t("imageFitContain")}</option>
              <option value="cover">{t("imageFitCover")}</option>
              <option value="fill">{t("imageFitFill")}</option>
            </select>
          </div>
        </div>
      )}

      {selectedNode.kind === "table" && (
        <div className="flex flex-col gap-3 border-b border-border pb-3">
          <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
            {t("tableSection")}
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("tableRows")}</label>
              <CommitNumberInput
                value={selectedNode.rows}
                min={1}
                max={20}
                onCommit={(rows) => onUpdateNode({ ...selectedNode, rows })}
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("tableColumns")}</label>
              <CommitNumberInput
                value={selectedNode.columns}
                min={1}
                max={12}
                onCommit={(columns) => onUpdateNode({ ...selectedNode, columns })}
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("tableHeaderRows")}</label>
              <CommitNumberInput
                value={selectedNode.headerRows}
                min={0}
                max={Math.min(5, selectedNode.rows)}
                onCommit={(headerRows) => onUpdateNode({ ...selectedNode, headerRows })}
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("tableHeaderColumns")}</label>
              <CommitNumberInput
                value={selectedNode.headerColumns}
                min={0}
                max={Math.min(5, selectedNode.columns)}
                onCommit={(headerColumns) => onUpdateNode({ ...selectedNode, headerColumns })}
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t("tableLabels")}</label>
            <textarea
              rows={Math.min(8, selectedNode.rows)}
              value={Array.from({ length: selectedNode.rows }, (_, row) =>
                Array.from({ length: selectedNode.columns }, (_, column) =>
                  selectedNode.cellLabels[row * selectedNode.columns + column] ?? "",
                ).join(" | "),
              ).join("\n")}
              onChange={(event) => {
                const cellLabels = event.target.value
                  .split("\n")
                  .flatMap((line) => line.split("|").map((cell) => cell.trim()))
                  .slice(0, selectedNode.rows * selectedNode.columns);
                onUpdateNode({ ...selectedNode, cellLabels });
              }}
              className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded font-mono text-[10px]"
            />
          </div>
        </div>
      )}

      {/* Sizing & Dimensions */}
      <div className="flex flex-col gap-3 pb-3 border-b border-border">
        <h4 className="font-bold text-[11px] text-muted-foreground uppercase tracking-wider">
          {t("dimensionsSection")}
        </h4>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t("width")}</label>
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
              <option value="fill">{t("modeFill")}</option>
              <option value="hug">{t("modeHug")}</option>
              <option value="fixed">{t("modeFixed")}</option>
            </select>
          </div>

          {selectedNode.box.width.mode === "fixed" && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("fixedWidth")}</label>
              <CommitNumberInput
                min={10}
                value={selectedNode.box.width.value}
                onCommit={(value) => updateBox({ width: { mode: "fixed", value } })}
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t("height")}</label>
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
              <option value="hug">{t("modeHug")}</option>
              <option value="fill">{t("modeFill")}</option>
              <option value="fixed">{t("modeFixed")}</option>
            </select>
          </div>

          {selectedNode.box.height.mode === "fixed" && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t("fixedHeight")}</label>
              <CommitNumberInput
                min={10}
                value={selectedNode.box.height.value}
                onCommit={(value) => updateBox({ height: { mode: "fixed", value } })}
                className="w-full mt-0.5 px-2 py-1 bg-background border border-border rounded"
              />
            </div>
          )}
        </div>

        {/* 4-side Padding */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground">{t("padding")}</span>
            <button
              type="button"
              onClick={() => setLinkPadding(!linkPadding)}
              className="text-[10px] text-primary hover:underline"
            >
              {linkPadding ? t("unlink") : t("link")}
            </button>
          </div>
          {linkPadding ? (
            <CommitNumberInput
              min={0}
              value={selectedNode.box.padding.top}
              onCommit={(val) => {
                updateBox({ padding: { top: val, right: val, bottom: val, left: val } });
              }}
              className="w-full px-2 py-1 bg-background border border-border rounded"
            />
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <div key={side}>
                  <span className="text-[9px] uppercase text-muted-foreground">{side[0]}</span>
                  <CommitNumberInput
                    min={0}
                    value={selectedNode.box.padding[side]}
                    onCommit={(val) => {
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
            <span className="text-[10px] font-medium text-muted-foreground">{t("strokeWidth")}</span>
            <button
              type="button"
              onClick={() => setLinkStroke(!linkStroke)}
              className="text-[10px] text-primary hover:underline"
            >
              {linkStroke ? t("unlink") : t("link")}
            </button>
          </div>
          {linkStroke ? (
            <CommitNumberInput
              min={0}
              value={selectedNode.box.strokeWidth.top}
              onCommit={(val) => {
                updateBox({ strokeWidth: { top: val, right: val, bottom: val, left: val } });
              }}
              className="w-full px-2 py-1 bg-background border border-border rounded"
            />
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <div key={side}>
                  <span className="text-[9px] uppercase text-muted-foreground">{side[0]}</span>
                  <CommitNumberInput
                    min={0}
                    value={selectedNode.box.strokeWidth[side]}
                    onCommit={(val) => {
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
            <span className="text-[10px] font-medium text-muted-foreground">{t("cornerRadius")}</span>
            <button
              type="button"
              onClick={() => setLinkRadius(!linkRadius)}
              className="text-[10px] text-primary hover:underline"
            >
              {linkRadius ? t("unlink") : t("link")}
            </button>
          </div>
          {linkRadius ? (
            <CommitNumberInput
              min={0}
              value={selectedNode.box.cornerRadius.topLeft}
              onCommit={(val) => {
                updateBox({ cornerRadius: { topLeft: val, topRight: val, bottomRight: val, bottomLeft: val } });
              }}
              className="w-full px-2 py-1 bg-background border border-border rounded"
            />
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {(["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).map((c, idx) => (
                <div key={c}>
                  <span className="text-[9px] uppercase text-muted-foreground">C{idx + 1}</span>
                  <CommitNumberInput
                    min={0}
                    value={selectedNode.box.cornerRadius[c]}
                    onCommit={(val) => {
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
          {t("colorsSection")}
        </h4>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t("fillToken")}</label>
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
            <label className="text-[10px] font-medium text-muted-foreground">{t("strokeColor")}</label>
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
          {t("targetVisibility")}
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {VISIBLE_TARGET_LAYOUT_KINDS.map((target) => {
            const isHidden = selectedNode.box.hiddenOnTargets?.includes(target);
            return (
              <label
                key={target}
                className="flex items-center gap-1.5 p-1.5 rounded border border-border bg-card cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => toggleTargetVisibility(target)}
                  className="rounded"
                />
                <span className="text-xs">{t(`target.${target}`)}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Modal for Creating New Semantic Field */}
      {showNewFieldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-border bg-background p-5 shadow-2xl">
            <h3 className="text-sm font-bold">{t("newFieldTitle")}</h3>
            <form onSubmit={handleCreateField} className="mt-3 space-y-3">
              <div>
                <label className="text-[11px] font-medium">{t("fieldKey")} *</label>
                <input
                  type="text"
                  required
                  placeholder={t("fieldKeyPlaceholder")}
                  value={newFieldKey}
                  onChange={(e) => setNewFieldKey(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 bg-background border border-border rounded text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium">{t("fieldLabel")}</label>
                <input
                  type="text"
                  placeholder={t("fieldLabelPlaceholder")}
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 bg-background border border-border rounded text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium">{t("fieldKind")}</label>
                  <select
                    value={newFieldKind}
                    onChange={(e) =>
                      setNewFieldKind(
                        e.target.value as SheetFieldDefinition["kind"],
                      )
                    }
                    className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded text-xs"
                  >
                    <option value="text">{t("kindText")}</option>
                    <option value="number">{t("kindNumber")}</option>
                    <option value="checkbox">{t("kindCheckbox")}</option>
                    <option value="select">{t("kindSelect")}</option>
                    <option value="multiline">{t("kindMultiline")}</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium">{t("defaultValue")}</label>
                  <input
                    type="text"
                    placeholder={t("defaultValuePlaceholder")}
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
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!newFieldKey.trim()}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {t("saveAndBind")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
