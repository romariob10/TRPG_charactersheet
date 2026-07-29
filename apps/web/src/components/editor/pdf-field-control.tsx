"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CharacterField, FieldValue, FieldWidget } from "@/lib/types";
import { cn } from "@/lib/utils";

const MIN_SINGLE_LINE_FONT_SIZE = 8;

function AutoFitTextInput({
  field,
  widget,
  value,
  zoom,
  className,
  style,
  onChange,
  onFocus,
  onBlur,
}: {
  field: CharacterField;
  widget: FieldWidget;
  value: string;
  zoom: number;
  className: string;
  style: CSSProperties;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fontSize, setFontSize] = useState(MIN_SINGLE_LINE_FONT_SIZE);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const fit = () => {
      const computed = window.getComputedStyle(input);
      const horizontalPadding =
        Number.parseFloat(computed.paddingLeft || "0") +
        Number.parseFloat(computed.paddingRight || "0");
      const availableWidth = Math.max(1, input.clientWidth - horizontalPadding);
      const maxByHeight = Math.max(
        MIN_SINGLE_LINE_FONT_SIZE,
        Math.min(24 * zoom, (input.clientHeight - 4) * 0.72),
      );
      if (!value) {
        setFontSize(maxByHeight);
        return;
      }
      const context = document.createElement("canvas").getContext("2d");
      if (!context) {
        setFontSize(maxByHeight);
        return;
      }
      context.font = `${computed.fontWeight} ${maxByHeight}px ${computed.fontFamily}`;
      const measuredWidth = context.measureText(value).width;
      const fitted =
        measuredWidth > availableWidth
          ? Math.max(
              MIN_SINGLE_LINE_FONT_SIZE,
              (maxByHeight * availableWidth) / measuredWidth,
            )
          : maxByHeight;
      setFontSize(Math.floor(fitted * 10) / 10);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(input);
    return () => observer.disconnect();
  }, [value, zoom]);

  return (
    <input
      ref={inputRef}
      id={`character-field-widget-${widget.id}`}
      aria-label={field.label}
      className={cn(className, "overflow-hidden px-1 whitespace-nowrap")}
      style={{
        ...style,
        fontSize: `${fontSize}px`,
        lineHeight: 1,
        textOverflow: "clip",
      }}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}

export function PdfFieldControl({
  field,
  widget,
  value,
  zoom,
  multilineFontScale,
  active,
  onChange,
  onFocus,
  onBlur,
}: {
  field: CharacterField;
  widget: FieldWidget;
  value: FieldValue;
  zoom: number;
  multilineFontScale: number;
  active: boolean;
  onChange: (value: FieldValue) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const [left, top, right, bottom] = widget.rect;
  const style = {
    left: `${left * 100}%`,
    top: `${top * 100}%`,
    width: `${(right - left) * 100}%`,
    height: `${(bottom - top) * 100}%`,
  };
  const className =
    "absolute z-10 border border-[var(--brand)]/35 bg-white/78 backdrop-blur-[1px] hover:bg-white/92 focus:bg-white focus:ring-2 focus:ring-[var(--brand)]/30";
  const activeLabel = active ? (
    <div
      role="status"
      className="pointer-events-none absolute z-30 -mt-1.5 max-w-64 -translate-y-full truncate rounded-md border border-[var(--border)] bg-white/96 px-2 py-1 text-[11px] font-semibold leading-tight shadow-[var(--shadow-overlay)]"
      style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
    >
      {field.label}
    </div>
  ) : null;

  if (field.kind === "checkbox") {
    return (
      <>
        {activeLabel}
        <input
          id={`character-field-widget-${widget.id}`}
          aria-label={field.label}
          className={cn(className, "cursor-pointer accent-[var(--brand)]")}
          style={style}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </>
    );
  }
  if (field.kind === "radio") {
    const option =
      widget.exportValue ??
      field.options[
        widget.id ? field.widgets.findIndex((item) => item.id === widget.id) : 0
      ] ??
      "";
    return (
      <>
        {activeLabel}
        <input
          id={`character-field-widget-${widget.id}`}
          aria-label={`${field.label}: ${option}`}
          className={cn(className, "cursor-pointer accent-[var(--brand)]")}
          style={style}
          type="radio"
          checked={value === option}
          onChange={() => onChange(option)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </>
    );
  }
  if (field.kind === "dropdown" || field.kind === "list") {
    return (
      <>
        {activeLabel}
        <select
          id={`character-field-widget-${widget.id}`}
          aria-label={field.label}
          className={cn(className, "px-1")}
          style={{ ...style, fontSize: `${Math.max(8, 12 * zoom)}px` }}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
        >
          <option value="" />
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </>
    );
  }
  if (
    field.kind === "button" ||
    field.kind === "signature" ||
    field.kind === "unknown"
  ) {
    return (
      <div
        id={`character-field-widget-${widget.id}`}
        title={`${field.label} — read only`}
        className="absolute z-10 border border-dashed border-slate-400/70 bg-slate-200/15"
        style={style}
      />
    );
  }
  if (field.kind === "multiline") {
    return (
      <>
        {activeLabel}
        <textarea
          id={`character-field-widget-${widget.id}`}
          aria-label={field.label}
          className={cn(className, "resize-none px-1 py-0.5 leading-tight")}
          style={{ ...style, fontSize: `${12 * zoom * multilineFontScale}px` }}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </>
    );
  }
  return (
    <>
      {activeLabel}
      <AutoFitTextInput
        field={field}
        widget={widget}
        className={className}
        style={style}
        value={typeof value === "string" ? value : ""}
        zoom={zoom}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </>
  );
}
