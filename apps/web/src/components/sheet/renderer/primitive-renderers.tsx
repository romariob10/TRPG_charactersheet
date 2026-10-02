"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import dynamic from "next/dynamic";
import { getTextareaFontSize, getSingleLineFontSize, TEXTAREA_LINE_HEIGHT } from "@mycharacter/contracts";
import { RenderTextareaList } from "./textarea-list";
import { Crop, ImageUp } from "lucide-react";
import type {
  CheckboxNode,
  DividerNode,
  FieldInputNode,
  ImageNode,
  NumberInputNode,
  SelectNode,
  SpacerNode,
  TableNode,
  TextNode,
  TextareaNode,
} from "@mycharacter/contracts";
import { useSheetRender } from "./sheet-render-context";
const PortraitCropDialog = dynamic(() => import("../player/portrait-crop-dialog").then((module) => module.PortraitCropDialog), { ssr: false });

const TEXT_VARIANTS = {
  body: "text-sm text-foreground",
  label: "text-xs font-semibold text-muted-foreground uppercase tracking-wider",
  title: "text-lg font-bold text-foreground tracking-tight",
  display: "text-2xl font-black text-foreground font-serif",
  caption: "text-[11px] text-muted-foreground",
};

const TEXT_ALIGNS = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export const RenderText: React.FC<{ node: TextNode }> = ({ node }) => {
  const variantClass = TEXT_VARIANTS[node.variant] || TEXT_VARIANTS.body;
  const alignClass = TEXT_ALIGNS[node.align] || TEXT_ALIGNS.left;

  const fontStyle: React.CSSProperties = {
    fontFamily:
      node.fontFamily === "Montserrat Alternates"
        ? "'Montserrat Alternates', sans-serif"
        : node.fontFamily === "Noto Sans"
          ? "'Noto Sans', sans-serif"
          : undefined,
    fontSize: node.fontSize !== undefined ? `${node.fontSize}px` : undefined,
    fontWeight:
      node.fontWeight !== undefined
        ? node.fontWeight
        : node.weight === "bold"
          ? 700
          : node.weight === "medium"
            ? 500
            : 400,
    letterSpacing:
      node.letterSpacing !== undefined ? `${node.letterSpacing}em` : undefined,
    lineHeight: node.lineHeight !== undefined ? node.lineHeight : undefined,
  };

  return (
    <div
      style={fontStyle}
      className={`${variantClass} ${alignClass} ${
        node.uppercase ? "uppercase" : ""
      }`}
    >
      {node.text || <span className="opacity-40 italic">Empty text</span>}
    </div>
  );
};

export const RenderFieldInput: React.FC<{ node: FieldInputNode }> = ({ node }) => {
  const { fieldValues, onFieldValueChange, onFieldCommit, mode } = useSheetRender();
  const rawValue = fieldValues?.[node.fieldBinding];
  const value = typeof rawValue === "string" ? rawValue : "";

  const isReadOnly = mode === "readonly" || mode === "print" || node.readOnly;
  const inputRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(getSingleLineFontSize(node.box.height.mode === "fixed" ? node.box.height.value : 24));
  useLayoutEffect(() => {
    const wrapper = inputRef.current;
    if (!wrapper) return;
    const slot = wrapper.closest<HTMLElement>("[data-node-id]") ?? wrapper;
    const measure = () => {
      if (node.box.height.mode === "hug") {
        setFontSize(getSingleLineFontSize(24));
        return;
      }
      const height = slot.clientHeight - (node.label ? 16 : 0);
      if (height <= 0) return;
      const baseSize = getSingleLineFontSize(height);
      let fittedSize = baseSize;
      if (value && typeof CanvasRenderingContext2D !== "undefined") {
        const context = document.createElement("canvas").getContext("2d");
        if (context) {
          context.font = `${baseSize}px Arial`;
          const textWidth = context.measureText(value).width;
          if (textWidth > 0) fittedSize = Math.max(8, Math.min(baseSize, Math.floor(baseSize * Math.max(1, slot.clientWidth - 16) / textWidth)));
        }
      }
      setFontSize(fittedSize);
    };
    measure();
    if (node.box.height.mode === "hug") return;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [node.label, node.box.height, value]);

  const inputClass = `min-w-0 w-full px-2 ${node.variant === "boxed" ? "py-1" : "py-0"} text-sm focus:outline-none ${node.variant === "plain" ? "focus:bg-primary/5" : "focus:ring-1 focus:ring-primary"} ${
    node.variant === "underline" ? "border-b border-border rounded-none"
      : node.variant === "boxed" ? "border border-border rounded-md bg-background/50"
        : "border-none bg-transparent"
  }`;

  return (
    <div ref={inputRef} className="flex h-full min-h-0 w-full flex-col gap-1" style={{ fontFamily: "Arial, sans-serif", fontSize, lineHeight: 1.2, textAlign: node.align ?? "left" }}>
      {node.label && (
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {node.label}
        </label>
      )}
      {isReadOnly ? (
        <div className={`flex flex-auto min-h-0 items-center ${node.align === "center" ? "justify-center" : node.align === "right" ? "justify-end" : ""} truncate px-2 py-0 text-sm text-foreground ${node.variant === "underline" ? "border-b border-border" : ""}`} style={{ borderColor: node.box.strokeColor === "ink" ? "#000" : undefined, fontSize, lineHeight: 1.2 }}>
          {value || (node.variant === "boxed" ? "—" : "")}
        </div>
      ) : (
        <input type="text" value={value}
          aria-label={node.label || node.name || node.fieldBinding}
          placeholder={node.placeholder}
          onChange={(event) => onFieldValueChange?.(node.fieldBinding, event.target.value)}
          onBlur={() => onFieldCommit?.(node.fieldBinding)}
          className={`${inputClass} flex-auto min-h-0`}
          style={{ borderColor: node.box.strokeColor === "ink" ? "#000" : undefined, fontSize, lineHeight: 1.2, textAlign: node.align ?? "left" }} />
      )}
    </div>
  );
};

export const RenderNumberInput: React.FC<{ node: NumberInputNode }> = ({ node }) => {
  const { fieldValues, onFieldValueChange, mode } = useSheetRender();
  const rawValue = fieldValues?.[node.fieldBinding];
  const committedValue =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
      ? Number(rawValue) || 0
      : 0;
  const isReadOnly = mode === "readonly" || mode === "print" || node.readOnly;

  const formattedDisplay =
    node.showSign && committedValue > 0 ? `+${committedValue}` : String(committedValue);

  const commitValue = (input: HTMLInputElement) => {
    if (input.value.trim() === "") {
      input.value = String(committedValue);
      return;
    }
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed)) {
      input.value = String(committedValue);
      return;
    }
    const nextValue = Math.min(node.max ?? Infinity, Math.max(node.min ?? -Infinity, parsed));
    input.value = String(nextValue);
    if (nextValue !== committedValue) {
      onFieldValueChange?.(node.fieldBinding, nextValue);
    }
  };

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(16);
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const slot = wrapper.closest<HTMLElement>("[data-node-id]") ?? wrapper;
    const measure = () => {
      const height = node.variant === "circle" ? 28 : node.box.height.mode === "hug" ? 28 : slot.clientHeight - (node.label ? 16 : 0);
      if (height <= 0) return;
      const baseSize = getSingleLineFontSize(height);
      const context = typeof CanvasRenderingContext2D !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
      let fittedSize = baseSize;
      if (context) {
        context.font = `bold ${baseSize}px Arial`;
        const width = context.measureText(formattedDisplay).width;
        if (width > 0) fittedSize = Math.max(8, Math.min(baseSize, Math.floor(baseSize * Math.max(1, slot.clientWidth - 4) / width)));
      }
      setFontSize(fittedSize);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [formattedDisplay, node.box.height, node.label, node.variant]);

  const inputProps = {
    "aria-label": node.label || node.name || node.fieldBinding,
    defaultValue: committedValue,
    style: { fontSize, lineHeight: 1.2 },
    min: node.min,
    max: node.max,
    step: node.step ?? 1,
    disabled: isReadOnly,
    onBlur: (event: React.FocusEvent<HTMLInputElement>) => commitValue(event.currentTarget),
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") {
        event.currentTarget.value = String(committedValue);
        event.currentTarget.blur();
      }
    },
  };

  return (
    <div ref={wrapperRef} className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-1" style={{ fontFamily: "Arial, sans-serif" }}>
      {node.label && (
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
          {node.label}
        </label>
      )}
      {isReadOnly ? (
        <div className="flex min-h-0 flex-1 items-center justify-center font-bold text-foreground text-center" style={{ fontSize, lineHeight: 1.2 }}>
          {formattedDisplay}
        </div>
      ) : node.variant === "circle" ? (
        <div className="w-10 h-10 rounded-full border-2 border-border flex items-center justify-center bg-card shadow-inner">
          <input
            key={committedValue}
            type="number"
            {...inputProps}
            className="w-8 text-center text-sm font-bold bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      ) : (
        <input
          key={committedValue}
          type="number"
          {...inputProps}
          placeholder={node.placeholder}
          className={`${node.box.width.mode === "hug" ? "w-16" : "w-full min-w-0"} min-h-0 flex-1 text-center ${node.variant === "plain" ? "py-0" : "py-1"} text-sm font-bold bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none ${node.variant === "plain" ? "focus:bg-primary/5" : "focus:ring-1 focus:ring-primary"} ${
            node.variant === "underline"
              ? "border-b border-border rounded-none"
              : node.variant === "plain" ? "border-none bg-transparent"
              : "border border-border rounded-md"
          }`}
        />
      )}
    </div>
  );
};

const RenderPlainTextarea: React.FC<{ node: TextareaNode }> = ({ node }) => {
  const t = useTranslations("Player");
  const { fieldValues, onFieldValueChange, onFieldCommit, mode } = useSheetRender();
  const rawValue = fieldValues?.[node.fieldBinding];
  const value = typeof rawValue === "string" ? rawValue : Array.isArray(rawValue) ? rawValue.join("\n") : "";
  const isReadOnly = mode === "readonly" || mode === "print" || node.readOnly;
  const heightFieldKey = `__layout_height__:${node.fieldBinding}`;
  const fontSizeFieldKey = `__layout_font_size__:${node.fieldBinding}`;
  const savedHeight = fieldValues?.[heightFieldKey];
  const textareaHeight = typeof savedHeight === "number" && savedHeight >= 48 ? savedHeight : undefined;
  const fontSize = getTextareaFontSize(node, fieldValues);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pointerStartHeight = useRef<number | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || mode === "builder") return;
    const resize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(textareaHeight ?? 48, textarea.scrollHeight + textarea.offsetHeight - textarea.clientHeight)}px`;
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(textarea.parentElement ?? textarea);
    return () => observer.disconnect();
  }, [fontSize, textareaHeight, value, mode]);

  useEffect(() => {
    if (mode !== "player") return;
    const persistManualHeight = () => {
      const startHeight = pointerStartHeight.current;
      pointerStartHeight.current = null;
      const textarea = textareaRef.current;
      if (!textarea || startHeight === null) return;
      // offsetHeight is in layout pixels, independent of the canvas zoom.
      const nextHeight = textarea.offsetHeight;
      if (Math.abs(nextHeight - startHeight) >= 2 && nextHeight >= 48) {
        onFieldValueChange?.(heightFieldKey, nextHeight);
        onFieldCommit?.(heightFieldKey);
      }
    };
    const cancelResize = () => {
      pointerStartHeight.current = null;
    };
    window.addEventListener("pointerup", persistManualHeight);
    window.addEventListener("pointercancel", cancelResize);
    window.addEventListener("blur", persistManualHeight);
    return () => {
      window.removeEventListener("pointerup", persistManualHeight);
      window.removeEventListener("pointercancel", cancelResize);
      window.removeEventListener("blur", persistManualHeight);
    };
  }, [heightFieldKey, onFieldValueChange, onFieldCommit, mode]);

  const updateFontSize = (nextSize: number) => {
    onFieldValueChange?.(fontSizeFieldKey, nextSize);
    onFieldCommit?.(fontSizeFieldKey);
  };

  return (
    <div className={`relative flex min-h-0 w-full flex-col gap-1 ${node.box.height.mode !== "hug" ? "h-full" : ""}`}>
      {node.label && (
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {node.label}
        </label>
      )}
      {isReadOnly ? (
        <div
          className={`text-sm whitespace-pre-wrap wrap-anywhere text-foreground px-2 py-1 ${mode === "print" ? "overflow-hidden" : ""}`}
          style={{ minHeight: textareaHeight, fontSize, fontFamily: "Arial, sans-serif", lineHeight: TEXTAREA_LINE_HEIGHT }}
        >
          {value || (node.variant === "boxed" ? "—" : "")}
        </div>
      ) : (
        <>
          {mode === "player" && node.variant !== "plain" && (
            <div className="absolute right-1 top-1 z-10 flex items-center overflow-hidden rounded border border-border bg-background/90 shadow-sm">
              <button
                type="button"
                onClick={() => updateFontSize(Math.max(8, fontSize - 1))}
                className="px-1.5 py-0.5 text-xs hover:bg-muted"
                aria-label={t("textareaFontSmaller")}
                title={t("textareaFontSmaller")}
              >
                −
              </button>
              <span className="min-w-7 text-center text-[10px]" aria-label={t("textareaFontSize")}>
                {fontSize}
              </span>
              <button
                type="button"
                onClick={() => updateFontSize(Math.min(32, fontSize + 1))}
                className="px-1.5 py-0.5 text-xs hover:bg-muted"
                aria-label={t("textareaFontLarger")}
                title={t("textareaFontLarger")}
              >
                +
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            rows={node.rows ?? 3}
            value={value}
            aria-label={node.label || node.name || node.fieldBinding}
            placeholder={node.placeholder}
            disabled={isReadOnly}
            onChange={(e) => onFieldValueChange?.(node.fieldBinding, e.target.value)}
            onPointerDown={(event) => {
              pointerStartHeight.current = mode === "player" ? event.currentTarget.offsetHeight : null;
            }}
            onBlur={() => onFieldCommit?.(node.fieldBinding)}
            style={{ fontSize, fontFamily: "Arial, sans-serif", lineHeight: TEXTAREA_LINE_HEIGHT }}
            className={`min-h-12 w-full px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary ${node.variant === "plain" ? "border-none bg-transparent" : node.variant === "underline" ? "border-b border-border" : "rounded-md border border-border bg-background/50"} ${mode === "builder" ? "resize-none flex-1" : `${node.variant === "plain" ? "resize-none" : "resize-y"} flex-auto`}`}
          />
        </>
      )}
    </div>
  );
};

export const RenderTextarea: React.FC<{ node: TextareaNode }> = ({ node }) =>
  node.listStyle && node.listStyle !== "none" ? <RenderTextareaList node={node} /> : <RenderPlainTextarea node={node} />;

export const RenderCheckbox: React.FC<{ node: CheckboxNode }> = ({ node }) => {
  const { fieldValues, onFieldValueChange, mode } = useSheetRender();
  const checked = Boolean(fieldValues?.[node.fieldBinding]);
  const controlSize = Math.min(16, node.box.width.mode === "fixed" ? node.box.width.value : 16, node.box.height.mode === "fixed" ? node.box.height.value : 16);
  const isReadOnly = mode === "readonly" || mode === "print" || node.readOnly;

  if (node.shape === "arc") {
    return (
      <label className="relative block h-6 min-w-6 cursor-pointer text-foreground">
        <input type="checkbox" checked={checked} disabled={isReadOnly}
          aria-label={node.name || node.label || node.fieldBinding}
          onChange={event => onFieldValueChange?.(node.fieldBinding, event.target.checked)}
          className="peer absolute inset-0 z-10 h-6 w-6 cursor-pointer opacity-0" />
        <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true" className="rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-primary">
          {node.showBorder !== false && <path d="M5 22 A12 12 0 1 1 15 28" fill="none" stroke="currentColor" strokeWidth="0.7" />}
          {checked && <path d="M9 14L14 19L23 9" fill="none" stroke="currentColor" strokeWidth="2" />}
        </svg>
        <span className="absolute bottom-0 left-1 text-[10px] leading-none">{node.label}</span>
      </label>
    );
  }

  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        aria-label={node.name || node.label || node.fieldBinding}
        checked={checked}
        disabled={isReadOnly}
        onChange={(e) =>
          onFieldValueChange?.(node.fieldBinding, e.target.checked)
        }
        className={`w-4 h-4 text-primary bg-background border-border focus:ring-primary ${
          node.shape === "circle" ? "appearance-none border checked:bg-primary rounded-full" : "rounded"
        }`}
        style={{ ...(node.showBorder === false ? { border: 0 } : {}),
          ...(node.box.strokeColor === "ink" ? { borderColor: "#000", backgroundColor: checked ? "#000" : "#fff", accentColor: "#000" } : {}),
          width: controlSize, height: controlSize, flexShrink: 0 }}
      />
      {node.label && (
        <span className="text-xs font-medium text-foreground">{node.label}</span>
      )}
    </label>
  );
};

export const RenderSelect: React.FC<{ node: SelectNode }> = ({ node }) => {
  const { fieldValues, onFieldValueChange, mode } = useSheetRender();
  const rawValue = fieldValues?.[node.fieldBinding];
  const value = typeof rawValue === "string" ? rawValue : "";
  const isReadOnly = mode === "readonly" || mode === "print" || node.readOnly;

  return (
    <div className="flex flex-col gap-1 w-full">
      {node.label && (
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {node.label}
        </label>
      )}
      {isReadOnly ? (
        <div className="font-medium text-foreground" style={{ fontSize: 14 }}>{value || "—"}</div>
      ) : (
        <select
          aria-label={node.label || node.name || node.fieldBinding}
          style={{ fontSize: 14 }}
          value={value}
          disabled={isReadOnly}
          onChange={(e) => onFieldValueChange?.(node.fieldBinding, e.target.value)}
          className="w-full px-2 py-1 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {node.placeholder && <option value="">{node.placeholder}</option>}
          {node.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

export const RenderDivider: React.FC<{ node: DividerNode }> = ({ node }) => {
  const isHoriz = node.direction === "horizontal";
  return (
    <div
      className={isHoriz ? "w-full border-t border-border" : "h-full border-l border-border"}
      style={{
        borderWidth: node.strokeWidth ?? 1,
      }}
    />
  );
};

export const RenderSpacer: React.FC<{ node: SpacerNode }> = ({ node }) => {
  return (
    <div
      style={{
        width: node.fill ? "100%" : `${node.size ?? 8}px`,
        height: node.fill ? "100%" : `${node.size ?? 8}px`,
        flexGrow: node.fill ? 1 : 0,
      }}
    />
  );
};

export const RenderImage: React.FC<{ node: ImageNode }> = ({ node }) => {
  const t = useTranslations("Player");
  const { fieldValues, mode, onImageUpload } = useSheetRender();
  const [cropSource, setCropSource] = useState<File | string | null>(null);
  const fieldValue = fieldValues?.[node.fieldBinding];
  const imageUrl = typeof fieldValue === "string" && fieldValue ? fieldValue : node.url;
  const aspectRatioValue = fieldValues?.[`__image_aspect_ratio__:${node.fieldBinding}`];
  const aspectRatio =
    typeof aspectRatioValue === "number" && aspectRatioValue > 0
      ? aspectRatioValue
      : undefined;
  const editable = mode === "player" && Boolean(onImageUpload);
  const slotRef = useRef<HTMLDivElement>(null);
  const [slotRatio, setSlotRatio] = useState<number | undefined>();
  const boundedHeight = node.box.height.mode !== "hug";
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot || !boundedHeight) return;
    const measure = () => {
      if (slot.clientWidth > 0 && slot.clientHeight > 0) {
        setSlotRatio(slot.clientWidth / slot.clientHeight);
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [boundedHeight]);

  const cropDialog = cropSource ? (
    <PortraitCropDialog
      source={cropSource}
      aspectRatio={boundedHeight ? slotRatio : aspectRatio}
      onCancel={() => setCropSource(null)}
      onConfirm={async (file, ratio) => {
        await onImageUpload?.(node.fieldBinding, file, ratio);
        setCropSource(null);
      }}
    />
  ) : null;

  if (!imageUrl) {
    const paperPortrait = node.box.fill === "surface";
    if (!editable) {
      return (
        <div className={`flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground ${boundedHeight ? "min-h-0" : "min-h-24"} ${paperPortrait ? "bg-transparent" : "rounded bg-muted/40"}`}>
          {!paperPortrait && <><ImageUp className="size-5" aria-hidden="true" /><span>{t("portraitPlaceholder")}</span></>}
        </div>
      );
    }
    return (<div ref={slotRef} className={`h-full w-full ${boundedHeight ? "min-h-0" : "min-h-24"}`}>
      <label className={`group flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 text-xs text-muted-foreground ${boundedHeight ? "min-h-0" : "min-h-24"} ${paperPortrait ? "bg-transparent hover:bg-muted/10" : "rounded bg-muted/40 hover:bg-muted/60"}`}>
        <span className={`flex flex-col items-center gap-2 ${paperPortrait ? "opacity-100 md:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" : ""}`}><ImageUp className="size-5" aria-hidden="true" />{t("portraitPlaceholder")}</span>
        <input
          type="file"
          aria-label={t("portraitPlaceholder")}
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) setCropSource(file);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {cropDialog}
    </div>);
  }

  return (
    <div
      ref={slotRef}
      className={`group relative w-full overflow-hidden rounded ${boundedHeight ? "min-h-0" : "min-h-24"}`}
      style={!boundedHeight && aspectRatio ? { aspectRatio } : { height: "100%" }}
    >
      <Image
        src={imageUrl}
        alt={node.alt || t("portraitAlt")}
        fill
        unoptimized
        sizes="(max-width: 767px) 100vw, 50vw"
        className={
          node.fit === "contain"
            ? "object-contain"
            : node.fit === "fill"
              ? "object-fill"
              : "object-cover"
        }
      />
      {editable && (
        <div className="absolute right-2 bottom-2 flex max-w-[calc(100%-1rem)] flex-wrap justify-end gap-1 opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button type="button" onClick={() => setCropSource(imageUrl)} className="flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-[11px] font-semibold text-foreground shadow-sm">
            <Crop className="size-3" /> {t("cropPortrait")}
          </button>
          <label className="cursor-pointer rounded-md bg-background/90 px-2 py-1 text-[11px] font-semibold text-foreground shadow-sm">
            {t("replacePortrait")}
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) setCropSource(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      )}
      {cropDialog}
    </div>
  );
};

export const RenderTable: React.FC<{ node: TableNode }> = ({ node }) => {
  const { fieldValues, onFieldValueChange, mode } = useSheetRender();
  const isReadOnly = mode === "readonly" || mode === "print" || node.readOnly;
  const cellCount = node.rows * node.columns;

  return (
    <div
      className="grid h-full w-full overflow-hidden border border-border"
      style={{ gridTemplateColumns: `repeat(${node.columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cellCount }, (_, index) => {
        const row = Math.floor(index / node.columns);
        const column = index % node.columns;
        const isHeader = row < node.headerRows || column < node.headerColumns;
        const label = node.cellLabels[index] ?? "";
        const fieldKey = `${node.fieldBindingPrefix}_${row}_${column}`;
        const rawValue = fieldValues?.[fieldKey];
        const value = typeof rawValue === "string" ? rawValue : "";

        return (
          <div
            key={`${row}:${column}`}
            className={`min-h-10 border-border ${column < node.columns - 1 ? "border-r" : ""} ${
              row < node.rows - 1 ? "border-b" : ""
            } ${
              isHeader ? "flex items-center bg-muted/30 px-2 text-xs font-semibold" : "bg-background/40"
            }`}
          >
            {isHeader || isReadOnly ? (
              <span className="whitespace-pre-wrap" style={{ fontSize: 12 }}>{isHeader ? label : value || "—"}</span>
            ) : (
              <input
                type="text"
                aria-label={label || `${node.name || node.fieldBindingPrefix} ${row + 1}:${column + 1}`}
                style={{ fontSize: 12 }}
                value={value}
                placeholder={label}
                onChange={(event) => onFieldValueChange?.(fieldKey, event.target.value)}
                className="h-full min-h-10 w-full bg-transparent px-2 py-1 text-xs outline-none focus:bg-primary/5 focus:ring-1 focus:ring-inset focus:ring-primary"
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
