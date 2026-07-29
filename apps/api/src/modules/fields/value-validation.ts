import type { FieldKind, FieldValue } from "@mycharacter/contracts";
import { AppError } from "../../errors.js";

export interface FieldDefinition {
  kind: FieldKind;
  options: unknown;
}

export function validateFieldValue(
  field: FieldDefinition,
  value: FieldValue,
): void {
  if (value === null) return;
  const options = stringOptions(field.options);
  const valid =
    field.kind === "text" || field.kind === "multiline"
      ? typeof value === "string" && value.length <= 20_000
      : field.kind === "checkbox"
        ? typeof value === "boolean"
        : field.kind === "radio" || field.kind === "dropdown"
          ? typeof value === "string" &&
            (options.length === 0 || options.includes(value))
          : field.kind === "list"
            ? validateListValue(value, options)
            : false;
  if (!valid) {
    throw new AppError(
      "FIELD_VALUE_INVALID",
      422,
      "The value is not valid for this PDF field.",
    );
  }
}

function validateListValue(value: FieldValue, options: string[]): boolean {
  const selected =
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value
        : undefined;
  return Boolean(
    selected &&
      (options.length === 0 ||
        selected.every((item) => options.includes(item))),
  );
}

function stringOptions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
