"use client";

import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { getTextareaFontSize, getTextareaListItems, TEXTAREA_LINE_HEIGHT, type TextareaNode } from "@mycharacter/contracts";
import { useSheetRender } from "./sheet-render-context";

function ListItem({ value, label, fontSize, readOnly, clipped, onChange, onCommit }: {
  value: string; label: string; fontSize: number; readOnly: boolean; clipped: boolean;
  onChange: (value: string) => void; onCommit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const resize = () => {
      input.style.height = "auto";
      input.style.height = `${Math.max(fontSize * TEXTAREA_LINE_HEIGHT + 8, input.scrollHeight)}px`;
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(input.parentElement ?? input);
    return () => observer.disconnect();
  }, [value, fontSize]);
  return readOnly ? <div style={{ maxHeight: clipped ? "100%" : undefined }} className={`min-w-0 min-h-0 flex-1 whitespace-pre-wrap wrap-anywhere px-1 ${clipped ? "py-0" : "py-1"} overflow-hidden`}>{value || "\u00a0"}</div>
    : <textarea ref={ref} rows={1} value={value} aria-label={label} maxLength={20_000}
        onChange={event => onChange(event.target.value)} onBlur={onCommit}
        className="min-w-0 w-full flex-auto resize-none overflow-hidden bg-transparent px-1 py-1 outline-none focus:ring-1 focus:ring-primary"
        style={{ fontSize, lineHeight: TEXTAREA_LINE_HEIGHT, fontFamily: "Arial, sans-serif" }} />;
}

export function RenderTextareaList({ node }: { node: TextareaNode }) {
  const t = useTranslations("Player");
  const { fieldValues, onFieldValueChange, onFieldCommit, mode } = useSheetRender();
  const items = getTextareaListItems(node, fieldValues);
  const fontSize = getTextareaFontSize(node, fieldValues);
  const readOnly = mode === "readonly" || mode === "print" || node.readOnly;
  const canChangeCount = mode === "player" && !readOnly && node.allowItemCountChange;
  const changeItem = (index: number, value: string) => {
    const raw = fieldValues?.[node.fieldBinding];
    const hiddenItems = !node.allowItemCountChange && Array.isArray(raw) ? raw.slice(items.length) : [];
    onFieldValueChange?.(node.fieldBinding, [...items.map((item, position) => position === index ? value : item), ...hiddenItems]);
  };
  const commitItem = () => onFieldCommit?.(node.fieldBinding);
  const changeCount = (next: string[]) => {
    onFieldValueChange?.(node.fieldBinding, next);
    onFieldCommit?.(node.fieldBinding);
  };
  return <div className={`flex w-full flex-col ${mode === "print" ? "h-full min-h-0 overflow-hidden" : node.box.height.mode !== "hug" ? "min-h-full" : ""}`}
    style={{ fontFamily: "Arial, sans-serif", fontSize, lineHeight: TEXTAREA_LINE_HEIGHT }}>
    {node.label && <div className="text-[11px] font-semibold uppercase text-muted-foreground">{node.label}</div>}
    <ul className="flex min-h-0 flex-auto list-none flex-col p-0 m-0" aria-label={node.label || node.name || node.fieldBinding}>
      {items.map((value, index) => <li key={node.itemBindings?.[index] ?? index}
        className={`flex min-h-0 flex-auto items-start gap-1 ${node.listStyle === "lined" ? "border-b" : ""}`}
        style={{ borderColor: node.box.strokeColor === "ink" ? "#000" : undefined, minHeight: mode === "print" ? 0 : fontSize * TEXTAREA_LINE_HEIGHT + 8, flexBasis: mode === "print" ? 0 : undefined, overflow: mode === "print" ? "hidden" : undefined }}>
        {node.itemCheckboxBindings?.[index] && <input type="checkbox"
          aria-label={t("listItemCheckbox", { name: node.itemLabels?.[index] || t("listItem", { name: node.name || node.fieldBinding, index: index + 1 }) })}
          checked={fieldValues?.[node.itemCheckboxBindings[index]] === true} disabled={readOnly}
          onChange={event => {
            const key = node.itemCheckboxBindings![index];
            onFieldValueChange?.(key, event.target.checked);
            onFieldCommit?.(key);
          }}
          className="mt-1.5 size-3 shrink-0 appearance-none rounded-full border border-black bg-white checked:bg-black focus-visible:outline-2 focus-visible:outline-primary" />}
        {node.listStyle !== "lined" && <span className="shrink-0 py-1" aria-hidden="true">{node.listStyle === "numbered" ? `${index + 1}.` : "•"}</span>}
        <ListItem value={value} fontSize={fontSize} readOnly={readOnly} clipped={mode === "print"}
          label={node.itemLabels?.[index] || t("listItem", { name: node.label || node.name || node.fieldBinding, index: index + 1 })}
          onChange={value => changeItem(index, value)} onCommit={commitItem} />
        {canChangeCount && <button type="button" disabled={items.length <= 1}
          aria-label={t("removeListItem", { index: index + 1 })} onClick={() => changeCount(items.filter((_, position) => position !== index))}
          className="shrink-0 px-1 py-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-30">×</button>}
      </li>)}
    </ul>
    {canChangeCount && <button type="button" disabled={items.length >= 50} onClick={() => changeCount([...items, ""])}
      className="mt-1 self-start rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">{t("addListItem")}</button>}
  </div>;
}
