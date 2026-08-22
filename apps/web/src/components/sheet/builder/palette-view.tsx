"use client";

import React from "react";
import type { LayoutNode, OrnamentStyle } from "@mycharacter/contracts";
import { defaultBoxProps } from "@mycharacter/contracts";

interface PaletteViewProps {
  onInsertNode: (node: LayoutNode) => void;
  onOpenComponentLibrary: () => void;
}

export const PaletteView: React.FC<PaletteViewProps> = ({
  onInsertNode,
  onOpenComponentLibrary,
}) => {
  const createFrame = (
    direction: "horizontal" | "vertical",
    ornament: OrnamentStyle = "none",
  ) => {
    const node: LayoutNode = {
      id: crypto.randomUUID(),
      kind: "frame",
      name: direction === "horizontal" ? "Row Frame" : "Column Frame",
      direction,
      gap: 8,
      align: "stretch",
      justify: "start",
      wrap: false,
      collapseAdjacentStrokes: false,
      ornamentStyle: ornament,
      titleDock: { dock: "none", variant: "none" },
      footerDock: { dock: "none", variant: "none" },
      box: {
        ...defaultBoxProps,
        padding: { top: 8, right: 8, bottom: 8, left: 8 },
        strokeWidth: { top: 1, right: 1, bottom: 1, left: 1 },
        cornerRadius: { topLeft: 4, topRight: 4, bottomRight: 4, bottomLeft: 4 },
        fill: "surface",
      },
      children: [],
    };
    onInsertNode(node);
  };

  const createText = (variant: "body" | "label" | "title" | "display" = "body") => {
    const node: LayoutNode = {
      id: crypto.randomUUID(),
      kind: "text",
      name: `${variant} Text`,
      text: variant === "title" ? "Header Title" : "Text label",
      variant,
      align: "left",
      weight: variant === "title" ? "bold" : "normal",
      uppercase: variant === "label",
      color: "default",
      box: { ...defaultBoxProps, width: { mode: "hug" } },
    };
    onInsertNode(node);
  };

  const createField = (kind: "text" | "number" | "textarea" | "checkbox" | "select") => {
    const fieldBinding = `field_${Math.floor(Math.random() * 10000)}`;
    let node: LayoutNode;

    switch (kind) {
      case "text":
        node = {
          id: crypto.randomUUID(),
          kind: "field-input",
          name: "Field Input",
          fieldBinding,
          label: "Field Label",
          placeholder: "Enter value…",
          variant: "underline",
          readOnly: false,
          box: defaultBoxProps,
        };
        break;
      case "number":
        node = {
          id: crypto.randomUUID(),
          kind: "number-input",
          name: "Number Box",
          fieldBinding,
          label: "STAT",
          placeholder: "0",
          variant: "boxed",
          showSign: false,
          readOnly: false,
          box: { ...defaultBoxProps, width: { mode: "hug" } },
        };
        break;
      case "textarea":
        node = {
          id: crypto.randomUUID(),
          kind: "textarea",
          name: "Text Area",
          fieldBinding,
          label: "Notes",
          placeholder: "Write description…",
          rows: 3,
          variant: "boxed",
          readOnly: false,
          box: defaultBoxProps,
        };
        break;
      case "checkbox":
        node = {
          id: crypto.randomUUID(),
          kind: "checkbox",
          name: "Checkbox",
          fieldBinding,
          label: "Proficiency",
          shape: "circle",
          readOnly: false,
          box: { ...defaultBoxProps, width: { mode: "hug" } },
        };
        break;
      case "select":
        node = {
          id: crypto.randomUUID(),
          kind: "select",
          name: "Dropdown",
          fieldBinding,
          label: "Selection",
          placeholder: "Choose option…",
          options: [
            { label: "Option 1", value: "opt1" },
            { label: "Option 2", value: "opt2" },
          ],
          readOnly: false,
          box: defaultBoxProps,
        };
        break;
    }
    onInsertNode(node);
  };

  const createRepeater = (mode: "runtime" | "design") => {
    const key = `repeater_${Math.floor(Math.random() * 10000)}`;
    const rowId = crypto.randomUUID();
    const rowTemplate: LayoutNode = {
      id: rowId,
      kind: "frame",
      name: "Repeater Row",
      direction: "horizontal",
      gap: 8,
      align: "center",
      justify: "start",
      wrap: false,
      collapseAdjacentStrokes: false,
      ornamentStyle: "none",
      titleDock: { dock: "none", variant: "none" },
      footerDock: { dock: "none", variant: "none" },
      box: { ...defaultBoxProps, fill: "transparent" },
      children: [
        {
          id: crypto.randomUUID(),
          kind: "field-input",
          name: "Item Name",
          fieldBinding: "name",
          label: "",
          placeholder: "Item name…",
          variant: "underline",
          readOnly: false,
          box: defaultBoxProps,
        },
        {
          id: crypto.randomUUID(),
          kind: "number-input",
          name: "Qty",
          fieldBinding: "qty",
          label: "",
          placeholder: "1",
          variant: "boxed",
          showSign: false,
          readOnly: false,
          box: { ...defaultBoxProps, width: { mode: "hug" } },
        },
      ],
    };

    const node: LayoutNode = {
      id: crypto.randomUUID(),
      kind: "repeater",
      name: mode === "runtime" ? "Dynamic List" : "Fixed Repeater",
      config: {
        key,
        mode,
        minRows: 0,
        maxRows: 50,
        initialRows: 1,
        allowAdd: true,
        allowRemove: true,
        allowReorder: true,
        emptyStateText: "No items yet. Click add to create.",
        addLabel: "+ Add Item",
        removeLabel: "Delete",
        printSplitPolicy: "auto",
        rowFieldSlots: [
          { slotId: "name", name: "Name", label: "Name", kind: "text", defaultValue: "", options: [] },
          { slotId: "qty", name: "Quantity", label: "Qty", kind: "number", defaultValue: 1, options: [] },
        ],
      },
      rowTemplate,
      box: defaultBoxProps,
    };
    onInsertNode(node);
  };

  const createDivider = () => {
    onInsertNode({
      id: crypto.randomUUID(),
      kind: "divider",
      name: "Divider",
      direction: "horizontal",
      strokeWidth: 1,
      strokeColor: "subtle",
      box: defaultBoxProps,
    });
  };

  const createSpacer = () => {
    onInsertNode({
      id: crypto.randomUUID(),
      kind: "spacer",
      name: "Spacer",
      size: 16,
      fill: false,
      box: { ...defaultBoxProps, width: { mode: "hug" }, height: { mode: "hug" } },
    });
  };

  return (
    <div className="flex flex-col gap-4 p-3 overflow-y-auto max-h-[calc(100vh-280px)]">
      {/* Layout Primitives */}
      <div>
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          Layout Frames
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => createFrame("vertical")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">🗂️</span>
            <div>
              <div className="text-xs font-semibold">Vertical Frame</div>
              <div className="text-[10px] text-muted-foreground">Auto Layout Col</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createFrame("horizontal")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">🗂️</span>
            <div>
              <div className="text-xs font-semibold">Horizontal Frame</div>
              <div className="text-[10px] text-muted-foreground">Auto Layout Row</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createFrame("vertical", "arc-corner")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">✨</span>
            <div>
              <div className="text-xs font-semibold">Ornament Frame</div>
              <div className="text-[10px] text-muted-foreground">Arc-corner style</div>
            </div>
          </button>

          <button
            type="button"
            onClick={createDivider}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">➖</span>
            <div>
              <div className="text-xs font-semibold">Divider</div>
              <div className="text-[10px] text-muted-foreground">Border line</div>
            </div>
          </button>

          <button
            type="button"
            onClick={createSpacer}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">⬜</span>
            <div>
              <div className="text-xs font-semibold">Spacer</div>
              <div className="text-[10px] text-muted-foreground">Gap spacing</div>
            </div>
          </button>
        </div>
      </div>

      {/* Fields & Controls */}
      <div>
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          Inputs & Fields
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => createText("title")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">🔤</span>
            <div>
              <div className="text-xs font-semibold">Header Text</div>
              <div className="text-[10px] text-muted-foreground">Title display</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createField("text")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">📝</span>
            <div>
              <div className="text-xs font-semibold">Text Input</div>
              <div className="text-[10px] text-muted-foreground">Underline/boxed</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createField("number")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">🔢</span>
            <div>
              <div className="text-xs font-semibold">Number Stat</div>
              <div className="text-[10px] text-muted-foreground">Value box</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createField("checkbox")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">☑️</span>
            <div>
              <div className="text-xs font-semibold">Checkbox</div>
              <div className="text-[10px] text-muted-foreground">Circle/Square</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createField("textarea")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">📄</span>
            <div>
              <div className="text-xs font-semibold">Text Area</div>
              <div className="text-[10px] text-muted-foreground">Multiline notes</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createField("select")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">📋</span>
            <div>
              <div className="text-xs font-semibold">Select Dropdown</div>
              <div className="text-[10px] text-muted-foreground">Options list</div>
            </div>
          </button>
        </div>
      </div>

      {/* Dynamic Repeaters */}
      <div>
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          Repeaters & Collections
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => createRepeater("runtime")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">🔁</span>
            <div>
              <div className="text-xs font-semibold">Dynamic List</div>
              <div className="text-[10px] text-muted-foreground">Player adds rows</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createRepeater("design")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">📊</span>
            <div>
              <div className="text-xs font-semibold">Fixed Repeater</div>
              <div className="text-[10px] text-muted-foreground">Design-time rows</div>
            </div>
          </button>
        </div>
      </div>

      {/* Component Library */}
      <div>
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          Library Components
        </h4>
        <button
          type="button"
          onClick={onOpenComponentLibrary}
          className="w-full flex items-center justify-center gap-2 p-2.5 rounded border border-dashed border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 text-primary transition-colors text-xs font-semibold"
        >
          <span>🧩</span>
          <span>Browse Component Library…</span>
        </button>
      </div>
    </div>
  );
};
