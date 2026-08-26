"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { CornerOrnamentPreset, LayoutNode } from "@mycharacter/contracts";
import { defaultBoxProps } from "@mycharacter/contracts";

interface PaletteViewProps {
  onInsertNode: (node: LayoutNode) => void;
  onOpenComponentLibrary: () => void;
}

export const PaletteView: React.FC<PaletteViewProps> = ({
  onInsertNode,
  onOpenComponentLibrary,
}) => {
  const t = useTranslations("Palette");
  const createFrame = (
    direction: "horizontal" | "vertical",
    ornament: CornerOrnamentPreset = "none",
  ) => {
    const node: LayoutNode = {
      id: crypto.randomUUID(),
      kind: "frame",
      name: direction === "horizontal" ? t("rowFrame") : t("columnFrame"),
      direction,
      gap: 9,
      align: "stretch",
      justify: "start",
      wrap: false,
      collapseAdjacentStrokes: false,
      cornerOrnaments: {
        preset: ornament,
        topLeft: true,
        topRight: true,
        bottomRight: true,
        bottomLeft: true,
      },
      box: {
        ...defaultBoxProps,
        padding: { top: 9, right: 9, bottom: 9, left: 9 },
        strokeWidth: { top: 1, right: 1, bottom: 1, left: 1 },
        strokeColor: "ink",
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
      name: variant === "title" ? t("headerText") : t("text"),
      text: variant === "title" ? t("defaultHeader") : t("defaultText"),
      variant,
      align: "left",
      weight: variant === "title" ? "bold" : "normal",
      fontFamily: "Noto Sans",
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
          name: t("textInput"),
          fieldBinding,
          label: t("defaultFieldLabel"),
          placeholder: t("defaultFieldPlaceholder"),
          variant: "underline",
          readOnly: false,
          box: defaultBoxProps,
        };
        break;
      case "number":
        node = {
          id: crypto.randomUUID(),
          kind: "number-input",
          name: t("numberStat"),
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
          name: t("textArea"),
          fieldBinding,
          label: t("notes"),
          placeholder: t("defaultTextareaPlaceholder"),
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
          name: t("checkbox"),
          fieldBinding,
          label: t("proficiency"),
          shape: "circle",
          showBorder: true,
          readOnly: false,
          box: { ...defaultBoxProps, width: { mode: "hug" } },
        };
        break;
      case "select":
        node = {
          id: crypto.randomUUID(),
          kind: "select",
          name: t("selectDropdown"),
          fieldBinding,
          label: t("selection"),
          placeholder: t("defaultSelectPlaceholder"),
          options: [
            { label: t("optionOne"), value: "opt1" },
            { label: t("optionTwo"), value: "opt2" },
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
      name: t("repeaterRow"),
      direction: "horizontal",
      gap: 9,
      align: "center",
      justify: "start",
      wrap: false,
      collapseAdjacentStrokes: false,
      cornerOrnaments: {
        preset: "none",
        topLeft: true,
        topRight: true,
        bottomRight: true,
        bottomLeft: true,
      },
      box: { ...defaultBoxProps, fill: "transparent" },
      children: [
        {
          id: crypto.randomUUID(),
          kind: "field-input",
          name: t("itemName"),
          fieldBinding: "name",
          label: "",
          placeholder: t("itemNamePlaceholder"),
          variant: "underline",
          readOnly: false,
          box: defaultBoxProps,
        },
        {
          id: crypto.randomUUID(),
          kind: "number-input",
          name: t("quantityShort"),
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
      name: mode === "runtime" ? t("dynamicList") : t("fixedRepeater"),
      config: {
        key,
        mode,
        minRows: 0,
        maxRows: 50,
        initialRows: 1,
        allowAdd: true,
        allowRemove: true,
        allowReorder: true,
        emptyStateText: t("emptyRepeater"),
        addLabel: t("addItem"),
        removeLabel: t("delete"),
        printSplitPolicy: "auto",
        rowFieldSlots: [
          { slotId: "name", name: t("name"), label: t("name"), kind: "text", defaultValue: "", options: [] },
          { slotId: "qty", name: t("quantity"), label: t("quantityShort"), kind: "number", defaultValue: 1, options: [] },
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
      name: t("divider"),
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
      name: t("spacer"),
      size: 16,
      fill: false,
      box: { ...defaultBoxProps, width: { mode: "hug" }, height: { mode: "hug" } },
    });
  };

  const createImage = () => {
    onInsertNode({
      id: crypto.randomUUID(),
      kind: "image",
      name: t("image"),
      url: "",
      alt: "",
      fit: "contain",
      box: { ...defaultBoxProps, height: { mode: "fixed", value: 160 } },
    });
  };

  const createTable = () => {
    onInsertNode({
      id: crypto.randomUUID(),
      kind: "table",
      name: t("table"),
      rows: 5,
      columns: 6,
      headerRows: 0,
      headerColumns: 1,
      cellLabels: ["+5", "", "", "", "", "", "+4", "", "", "", "", "", "+3", "", "", "", "", "", "+2", "", "", "", "", "", "+1"],
      fieldBindingPrefix: `table_${Math.floor(Math.random() * 10000)}`,
      readOnly: false,
      box: { ...defaultBoxProps, width: { mode: "fill" } },
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      {/* Layout Primitives */}
      <div>
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          {t("layoutFrames")}
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => createFrame("vertical")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">🗂️</span>
            <div>
              <div className="text-xs font-semibold">{t("verticalFrame")}</div>
              <div className="text-[10px] text-muted-foreground">{t("autoLayoutColumn")}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createFrame("horizontal")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">🗂️</span>
            <div>
              <div className="text-xs font-semibold">{t("horizontalFrame")}</div>
              <div className="text-[10px] text-muted-foreground">{t("autoLayoutRow")}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createFrame("vertical", "fate-turnback")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">✨</span>
            <div>
              <div className="text-xs font-semibold">{t("ornamentFrame")}</div>
              <div className="text-[10px] text-muted-foreground">{t("ornamentFrameHint")}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={createDivider}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">➖</span>
            <div>
              <div className="text-xs font-semibold">{t("divider")}</div>
              <div className="text-[10px] text-muted-foreground">{t("dividerHint")}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={createSpacer}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">⬜</span>
            <div>
              <div className="text-xs font-semibold">{t("spacer")}</div>
              <div className="text-[10px] text-muted-foreground">{t("spacerHint")}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={createTable}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">▦</span>
            <div>
              <div className="text-xs font-semibold">{t("table")}</div>
              <div className="text-[10px] text-muted-foreground">{t("tableHint")}</div>
            </div>
          </button>
        </div>
      </div>

      {/* Fields & Controls */}
      <div>
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          {t("inputsAndFields")}
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => createText("title")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">🔤</span>
            <div>
              <div className="text-xs font-semibold">{t("headerText")}</div>
              <div className="text-[10px] text-muted-foreground">{t("headerTextHint")}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createField("text")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">📝</span>
            <div>
              <div className="text-xs font-semibold">{t("textInput")}</div>
              <div className="text-[10px] text-muted-foreground">{t("textInputHint")}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createField("number")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">🔢</span>
            <div>
              <div className="text-xs font-semibold">{t("numberStat")}</div>
              <div className="text-[10px] text-muted-foreground">{t("numberStatHint")}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createField("checkbox")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">☑️</span>
            <div>
              <div className="text-xs font-semibold">{t("checkbox")}</div>
              <div className="text-[10px] text-muted-foreground">{t("checkboxHint")}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createField("textarea")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">📄</span>
            <div>
              <div className="text-xs font-semibold">{t("textArea")}</div>
              <div className="text-[10px] text-muted-foreground">{t("textAreaHint")}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createField("select")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">📋</span>
            <div>
              <div className="text-xs font-semibold">{t("selectDropdown")}</div>
              <div className="text-[10px] text-muted-foreground">{t("selectDropdownHint")}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={createImage}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">🖼️</span>
            <div>
              <div className="text-xs font-semibold">{t("image")}</div>
              <div className="text-[10px] text-muted-foreground">{t("imageHint")}</div>
            </div>
          </button>
        </div>
      </div>

      {/* Dynamic Repeaters */}
      <div>
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          {t("repeatersAndCollections")}
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => createRepeater("runtime")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">🔁</span>
            <div>
              <div className="text-xs font-semibold">{t("dynamicList")}</div>
              <div className="text-[10px] text-muted-foreground">{t("dynamicListHint")}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => createRepeater("design")}
            className="flex items-center gap-2 p-2 rounded border border-border bg-card hover:border-primary/50 text-left transition-colors"
          >
            <span className="text-sm">📊</span>
            <div>
              <div className="text-xs font-semibold">{t("fixedRepeater")}</div>
              <div className="text-[10px] text-muted-foreground">{t("fixedRepeaterHint")}</div>
            </div>
          </button>
        </div>
      </div>

      {/* Component Library */}
      <div>
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          {t("libraryComponents")}
        </h4>
        <button
          type="button"
          onClick={onOpenComponentLibrary}
          className="w-full flex items-center justify-center gap-2 p-2.5 rounded border border-dashed border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 text-primary transition-colors text-xs font-semibold"
        >
          <span>🧩</span>
          <span>{t("browseLibrary")}</span>
        </button>
      </div>
    </div>
  );
};
