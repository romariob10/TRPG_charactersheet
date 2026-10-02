import { z } from "zod";
import type { FieldValue } from "./characters.js";

export const CHARACTER_FONT_SIZE_FIELD = "__layout_main_font_size__";
export const DEFAULT_CHARACTER_FONT_SIZE = 12;
export const characterFontSizeSchema = z.number().int().min(8).max(24);

export function getCharacterFontSize(values: Record<string, FieldValue> = {}): number {
  const parsed = characterFontSizeSchema.safeParse(values[CHARACTER_FONT_SIZE_FIELD]);
  return parsed.success ? parsed.data : DEFAULT_CHARACTER_FONT_SIZE;
}
