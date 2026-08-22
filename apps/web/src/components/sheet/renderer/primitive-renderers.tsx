"use client";

import React from "react";
import type {
  CheckboxNode,
  DividerNode,
  FieldInputNode,
  ImageNode,
  NumberInputNode,
  SelectNode,
  SpacerNode,
  TextNode,
  TextareaNode,
} from "@mycharacter/contracts";
import { useSheetRender } from "./sheet-render-context.js";

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

  return (
    <div
      className={`${variantClass} ${alignClass} ${
        node.uppercase ? "uppercase" : ""
      } ${node.weight === "bold" ? "font-bold" : node.weight === "medium" ? "font-medium" : "font-normal"}`}
    >
      {node.text || <span className="opacity-40 italic">Empty text</span>}
    </div>
  );
};

export const RenderFieldInput: React.FC<{ node: FieldInputNode }> = ({ node }) => {
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
        <div className="text-sm font-medium text-foreground min-h-[1.5rem] py-0.5 border-b border-muted">
          {value || "—"}
        </div>
      ) : (
        <input
          type="text"
          value={value}
          placeholder={node.placeholder}
          disabled={isReadOnly}
          onChange={(e) => onFieldValueChange?.(node.fieldBinding, e.target.value)}
          className={`w-full px-2 py-1 text-sm bg-background/50 focus:outline-none focus:ring-1 focus:ring-primary ${
            node.variant === "underline"
              ? "border-b border-border rounded-none focus:border-primary"
              : node.variant === "boxed"
              ? "border border-border rounded-md"
              : "border-none bg-transparent"
          }`}
        />
      )}
    </div>
  );
};

export const RenderNumberInput: React.FC<{ node: NumberInputNode }> = ({ node }) => {
  const { fieldValues, onFieldValueChange, mode } = useSheetRender();
  const rawValue = fieldValues?.[node.fieldBinding];
  const numValue =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
      ? Number(rawValue) || 0
      : 0;

  const isReadOnly = mode === "readonly" || mode === "print" || node.readOnly;

  const formattedDisplay =
    node.showSign && numValue > 0 ? `+${numValue}` : String(numValue);

  return (
    <div className="flex flex-col items-center gap-1">
      {node.label && (
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
          {node.label}
        </label>
      )}
      {isReadOnly ? (
        <div className="text-base font-bold text-foreground text-center">
          {formattedDisplay}
        </div>
      ) : node.variant === "circle" ? (
        <div className="w-10 h-10 rounded-full border-2 border-border flex items-center justify-center bg-card shadow-inner">
          <input
            type="number"
            value={numValue}
            min={node.min}
            max={node.max}
            step={node.step ?? 1}
            disabled={isReadOnly}
            onChange={(e) =>
              onFieldValueChange?.(node.fieldBinding, Number(e.target.value) || 0)
            }
            className="w-8 text-center text-sm font-bold bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      ) : (
        <input
          type="number"
          value={numValue}
          min={node.min}
          max={node.max}
          step={node.step ?? 1}
          placeholder={node.placeholder}
          disabled={isReadOnly}
          onChange={(e) =>
            onFieldValueChange?.(node.fieldBinding, Number(e.target.value) || 0)
          }
          className={`w-16 text-center py-1 text-sm font-bold bg-background focus:outline-none focus:ring-1 focus:ring-primary ${
            node.variant === "underline"
              ? "border-b border-border rounded-none"
              : "border border-border rounded-md"
          }`}
        />
      )}
    </div>
  );
};

export const RenderTextarea: React.FC<{ node: TextareaNode }> = ({ node }) => {
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
        <div className="text-sm whitespace-pre-wrap text-foreground py-1">
          {value || "—"}
        </div>
      ) : (
        <textarea
          rows={node.rows ?? 3}
          value={value}
          placeholder={node.placeholder}
          disabled={isReadOnly}
          onChange={(e) => onFieldValueChange?.(node.fieldBinding, e.target.value)}
          className="w-full px-2 py-1.5 text-sm bg-background/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary resize-y"
        />
      )}
    </div>
  );
};

export const RenderCheckbox: React.FC<{ node: CheckboxNode }> = ({ node }) => {
  const { fieldValues, onFieldValueChange, mode } = useSheetRender();
  const checked = Boolean(fieldValues?.[node.fieldBinding]);
  const isReadOnly = mode === "readonly" || mode === "print" || node.readOnly;

  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        disabled={isReadOnly}
        onChange={(e) =>
          onFieldValueChange?.(node.fieldBinding, e.target.checked)
        }
        className={`w-4 h-4 text-primary bg-background border-border focus:ring-primary ${
          node.shape === "circle" ? "rounded-full" : "rounded"
        }`}
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
        <div className="text-sm font-medium text-foreground">{value || "—"}</div>
      ) : (
        <select
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
  if (!node.url) {
    return (
      <div className="w-full h-24 bg-muted/40 rounded flex items-center justify-center text-xs text-muted-foreground">
        No image
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={node.url}
      alt={node.alt || "Character Sheet Asset"}
      className={`rounded w-full h-full object-${node.fit ?? "cover"}`}
    />
  );
};
