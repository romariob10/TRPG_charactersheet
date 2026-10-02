import { z } from "zod";
import type { FieldValue } from "./characters.js";
import type { LayoutNode, TextareaNode } from "./sheet-blueprints.js";

export const CHARACTER_FONT_SIZE_FIELD = "__layout_main_font_size__";
export const DEFAULT_CHARACTER_FONT_SIZE = 12;
export const characterFontSizeSchema = z.number().int().min(8).max(24);

export function getCharacterFontSize(values: Record<string, FieldValue> = {}): number {
  const parsed = characterFontSizeSchema.safeParse(values[CHARACTER_FONT_SIZE_FIELD]);
  return parsed.success ? parsed.data : DEFAULT_CHARACTER_FONT_SIZE;
}

export const TEXTAREA_LINE_HEIGHT = 1.25;

export function getSingleLineFontSize(height: number): number {
  return Math.max(8, Math.min(32, Math.floor(height * 0.6)));
}

export function getTextareaFontSize(node: TextareaNode, values: Record<string, FieldValue> = {}): number {
  const saved = values[`__layout_font_size__:${node.fieldBinding}`];
  return typeof saved === "number" && Number.isInteger(saved) && saved >= 8 && saved <= 32
    ? saved : getCharacterFontSize(values);
}

export function getTextareaListItems(node: TextareaNode, values: Record<string, FieldValue> = {}): string[] {
  const raw = values[node.fieldBinding];
  const items = Array.isArray(raw) ? raw : node.itemBindings
    ? node.itemBindings.map(key => typeof values[key] === "string" ? values[key] : "")
    : typeof raw === "string" && raw ? raw.split(/\r?\n/) : [];
  const count = node.allowItemCountChange && Array.isArray(raw) ? Math.max(1, items.length) : node.itemCount ?? node.itemBindings?.length ?? 3;
  return Array.from({ length: count }, (_, index) => items[index] ?? "");
}

// Old Fate sheets used one text input per ruled item. Adapt their rendering while
// retaining version ids and field keys, so existing characters need no migration.
export function upgradeLegacyFateTextLists(node: LayoutNode): LayoutNode {
  if (node.kind !== "frame") return node;
  const ruled = node.cornerOrnaments?.preset === "fate-turnback" && node.children.length > 0 &&
    node.children.every(child => child.kind === "field-input" && child.variant === "underline" && /^(aspect|consequence)_\d+$/.test(child.fieldBinding));
  if (ruled) return { ...node, children: node.children.map(child => {
    if (child.kind !== "field-input") return child;
    return { ...child, kind: "textarea", rows: 1, listStyle: "lined", itemCount: 1,
      itemBindings: [child.fieldBinding], itemLabels: [child.label || child.name || child.fieldBinding] };
  }) };
  const children = node.children.map(upgradeLegacyFateTextLists);
  return children.some((child, index) => child !== node.children[index]) ? { ...node, children } : node;
}
