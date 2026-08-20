"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { CharacterField, FieldValue } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface InteractiveFieldSection {
  id: string;
  title: string | null;
  fields: CharacterField[];
}

interface InteractiveFieldRow {
  id: string;
  label: string;
  fields: CharacterField[];
}

interface InteractiveResourceTrack extends InteractiveFieldRow {
  current: CharacterField | null;
  maximum: CharacterField | null;
}

interface InteractiveTableRow {
  id: string;
  fields: CharacterField[];
}

export type InteractiveBlock =
  | { kind: "stats"; id: string; rows: InteractiveFieldRow[] }
  | { kind: "skills"; id: string; rows: InteractiveFieldRow[] }
  | { kind: "resources"; id: string; tracks: InteractiveResourceTrack[] }
  | {
      kind: "table";
      id: string;
      columns: string[];
      rows: InteractiveTableRow[];
    }
  | {
      kind: "options" | "text" | "fields";
      id: string;
      fields: CharacterField[];
    };

export interface InteractiveLayoutSection extends InteractiveFieldSection {
  blocks: InteractiveBlock[];
}

type FieldRole =
  | "current"
  | "maximum"
  | "proficiency"
  | "score"
  | "modifier"
  | "check"
  | "save"
  | "other";

const sectionPatterns = {
  stats:
    /(?:characteristic|attribute|ability|stat|характерист|атрибут|параметр|показател)/i,
  skills: /(?:skill|proficien|training|навык|умени|владен|обучен)/i,
  resources:
    /(?:resource|health|hit points|\bhp\b|stamina|mana|wound|stress|luck|resolve|ресурс|здоров|хит|выносл|мана|ран|стресс|удач|решим)/i,
  table:
    /(?:attack|weapon|equipment|inventory|spell|armor|атак|оруж|снаряж|инвентар|заклин|брон)/i,
  text: /(?:notes?|features?|traits?|description|biograph|backstory|personality|замет|особен|черт|описан|биограф|предыстор|личност)/i,
};

const rolePatterns: Array<[FieldRole, RegExp]> = [
  ["current", /(?:\bcurrent\b|\bcur\b|текущ|сейчас)/i],
  ["maximum", /(?:\bmaximum\b|\bmax\b|максим|предел)/i],
  ["proficiency", /(?:proficien|trained|training|владен|обучен)/i],
  ["save", /(?:saving throw|\bsave\b|спасброс|испытан)/i],
  ["check", /(?:\bcheck\b|\btest\b|\broll\b|проверк|бросок)/i],
  ["modifier", /(?:modifier|\bmod\b|bonus|бонус|модифик)/i],
  [
    "score",
    /(?:\bscore\b|\bvalue\b|\bbase\b|\brating\b|значен|базов|рейтинг)/i,
  ],
];

function fieldPosition(field: CharacterField) {
  const widget = field.widgets[0];
  return {
    page: widget?.page ?? field.page,
    top: widget?.rect[1] ?? 0,
    left: widget?.rect[0] ?? 0,
  };
}

function compareFieldPositions(
  left: ReturnType<typeof fieldPosition>,
  right: ReturnType<typeof fieldPosition>,
) {
  if (left.page !== right.page) return left.page - right.page;
  if (Math.abs(left.top - right.top) > 0.025) return left.top - right.top;
  return left.left - right.left;
}

function compareFields(left: CharacterField, right: CharacterField) {
  if (
    left.groupId &&
    left.groupId === right.groupId &&
    left.groupOrder !== null &&
    right.groupOrder !== null
  ) {
    return left.groupOrder - right.groupOrder;
  }
  return compareFieldPositions(fieldPosition(left), fieldPosition(right));
}

function sectionSlug(title: string) {
  const slug = Array.from(title.normalize("NFKD").toLocaleLowerCase())
    .map((character) => {
      if (/[a-z0-9]/.test(character)) return character;
      if (/\p{Letter}|\p{Number}/u.test(character)) {
        return `u${character.codePointAt(0)?.toString(36) ?? "0"}-`;
      }
      return "-";
    })
    .join("")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "other";
}

export function arrangeInteractiveSections(
  fields: CharacterField[],
): InteractiveFieldSection[] {
  const groupAnchors = new Map<string, ReturnType<typeof fieldPosition>>();
  for (const field of fields) {
    if (!field.groupId) continue;
    const position = fieldPosition(field);
    const current = groupAnchors.get(field.groupId);
    if (!current || compareFieldPositions(position, current) < 0) {
      groupAnchors.set(field.groupId, position);
    }
  }

  const sorted = [...fields].sort((left, right) => {
    const leftPosition = fieldPosition(left);
    const rightPosition = fieldPosition(right);
    const positionDifference = compareFieldPositions(
      (left.groupId && groupAnchors.get(left.groupId)) || leftPosition,
      (right.groupId && groupAnchors.get(right.groupId)) || rightPosition,
    );
    return positionDifference || compareFields(left, right);
  });

  const sections = new Map<string, InteractiveFieldSection>();
  const usedIds = new Set<string>();
  for (const field of sorted) {
    const title = field.section?.trim() || null;
    const key = title?.toLocaleLowerCase() ?? `page-${field.page}-other`;
    let section = sections.get(key);
    if (!section) {
      const baseId = `section-${sectionSlug(title ?? `page-${field.page}-other`)}`;
      let id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);
      section = { id, title, fields: [] };
    }
    section.fields.push(field);
    sections.set(key, section);
  }
  return [...sections.values()];
}

function fieldText(field: CharacterField) {
  return [field.label, field.pdfName, ...field.aliases].join(" ");
}

function fieldRole(field: CharacterField): FieldRole {
  const text = fieldText(field);
  return rolePatterns.find(([, pattern]) => pattern.test(text))?.[0] ?? "other";
}

function semanticLabel(field: CharacterField) {
  const cleaned = field.label
    .replace(
      /(?:\bcurrent\b|\bcur\b|\bmaximum\b|\bmax\b|proficien\w*|trained|training|saving throw|\bsave\b|\bcheck\b|\btest\b|\broll\b|modifier|\bmod\b|bonus|\bscore\b|\bvalue\b|\bbase\b|\brating\b|текущ\w*|сейчас|максим\w*|предел|владен\w*|обучен\w*|спасброс\w*|испытан\w*|проверк\w*|бросок\w*|бонус\w*|модифик\w*|значен\w*|базов\w*|рейтинг\w*)/giu,
      " ",
    )
    .replace(/(?:^|\s)[#№]?\d+(?=\s|$)/g, " ")
    .replace(/[()[\]_:./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || field.label;
}

function semanticKey(field: CharacterField) {
  return semanticLabel(field).toLocaleLowerCase();
}

function rowLabel(fields: CharacterField[]) {
  const anchor =
    fields.find((field) => fieldRole(field) === "other") ??
    fields.find((field) => fieldRole(field) === "score") ??
    fields.find((field) => fieldRole(field) === "current") ??
    fields[0];
  return anchor ? semanticLabel(anchor) : "";
}

function roleRank(field: CharacterField) {
  const order: FieldRole[] = [
    "proficiency",
    "score",
    "current",
    "modifier",
    "check",
    "save",
    "maximum",
    "other",
  ];
  return order.indexOf(fieldRole(field));
}

function buildSemanticRows(fields: CharacterField[]): InteractiveFieldRow[] {
  const compoundRows: Array<{ id: string; fields: CharacterField[] }> = [];
  const handled = new Set<string>();
  const groups = new Map<string, CharacterField[]>();
  for (const field of fields) {
    if (!field.groupId) continue;
    groups.set(field.groupId, [...(groups.get(field.groupId) ?? []), field]);
  }
  for (const [groupId, groupFields] of groups) {
    const semanticKeys = new Set(groupFields.map(semanticKey));
    const hasCompoundRole = groupFields.some(
      (field) => fieldRole(field) !== "other",
    );
    if (
      groupFields.length < 2 ||
      (!hasCompoundRole && semanticKeys.size !== 1)
    ) {
      continue;
    }
    compoundRows.push({ id: `group-${groupId}`, fields: groupFields });
    for (const field of groupFields) handled.add(field.id);
  }

  const rows = new Map<string, CharacterField[]>();
  for (const field of fields) {
    if (handled.has(field.id)) continue;
    const key = semanticKey(field);
    const row = rows.get(key) ?? [];
    row.push(field);
    rows.set(key, row);
  }
  return [
    ...compoundRows,
    ...[...rows.entries()].map(([key, rowFields]) => ({
      id: `${key}-${rowFields[0]?.id ?? "row"}`,
      fields: rowFields,
    })),
  ]
    .sort((left, right) => compareFields(left.fields[0], right.fields[0]))
    .map((row) => ({
      id: row.id,
      label: rowLabel(row.fields),
      fields: [...row.fields].sort(
        (left, right) =>
          roleRank(left) - roleRank(right) || compareFields(left, right),
      ),
    }));
}

function numberedField(field: CharacterField) {
  const match = `${field.label} ${field.pdfName}`.match(
    /(?:^|[^\d])(\d{1,2})(?=[^\d]|$)/,
  );
  return match ? Number(match[1]) : null;
}

function columnLabel(field: CharacterField) {
  return (
    field.label
      .replace(/(?:^|\s)[#№]?\d+(?=\s|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim() || field.label
  );
}

function buildRepeatedTable(
  id: string,
  fields: CharacterField[],
): Extract<InteractiveBlock, { kind: "table" }> | null {
  const numberedRows = new Map<number, CharacterField[]>();
  const unnumbered: CharacterField[] = [];
  for (const field of fields) {
    const index = numberedField(field);
    if (index === null) unnumbered.push(field);
    else {
      numberedRows.set(index, [...(numberedRows.get(index) ?? []), field]);
    }
  }

  let tableRows: InteractiveTableRow[] | null = null;
  if (
    numberedRows.size >= 2 &&
    unnumbered.length <= Math.max(1, fields.length / 4)
  ) {
    tableRows = [...numberedRows.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, rowFields]) => ({
        id: `${id}-${index}`,
        fields: [...rowFields].sort(compareFields),
      }));
  }

  if (!tableRows) {
    const geometricRows: Array<{
      page: number;
      top: number;
      fields: CharacterField[];
    }> = [];
    for (const field of [...fields].sort((left, right) =>
      compareFieldPositions(fieldPosition(left), fieldPosition(right)),
    )) {
      const position = fieldPosition(field);
      let row: (typeof geometricRows)[number] | undefined;
      for (let index = geometricRows.length - 1; index >= 0; index -= 1) {
        const candidate = geometricRows[index];
        if (
          candidate.page === position.page &&
          Math.abs(candidate.top - position.top) <= 0.025
        ) {
          row = candidate;
          break;
        }
      }
      if (row) row.fields.push(field);
      else {
        geometricRows.push({
          page: position.page,
          top: position.top,
          fields: [field],
        });
      }
    }
    if (
      geometricRows.length < 2 ||
      geometricRows.some((row) => row.fields.length < 2)
    ) {
      return null;
    }
    tableRows = geometricRows.map((row, index) => ({
      id: `${id}-geometry-${index + 1}`,
      fields: [...row.fields].sort(
        (left, right) => fieldPosition(left).left - fieldPosition(right).left,
      ),
    }));
  }

  const exemplar = tableRows.reduce((largest, row) =>
    row.fields.length > largest.fields.length ? row : largest,
  );
  return {
    kind: "table",
    id,
    columns: exemplar.fields.map(columnLabel),
    rows: tableRows,
  };
}

function looksLikeResource(fields: CharacterField[], title: string) {
  const roles = new Set(fields.map(fieldRole));
  return (
    sectionPatterns.resources.test(title) ||
    (roles.has("current") && roles.has("maximum"))
  );
}

function looksLikeStat(fields: CharacterField[]) {
  const roles = new Set(fields.map(fieldRole));
  return (
    fields.length > 1 &&
    (roles.has("modifier") || roles.has("check") || roles.has("save"))
  );
}

function looksLikeSkill(fields: CharacterField[]) {
  return fields.some((field) => fieldRole(field) === "proficiency");
}

function fieldFamilies(fields: CharacterField[]) {
  const families = new Map<string, CharacterField[]>();
  for (const field of fields) {
    const key = field.groupId
      ? `group-${field.groupId}`
      : `semantic-${semanticKey(field)}`;
    families.set(key, [...(families.get(key) ?? []), field]);
  }
  return [...families.entries()].map(([id, familyFields]) => ({
    id,
    fields: [...familyFields].sort(compareFields),
  }));
}

function buildSectionBlocks(
  section: InteractiveFieldSection,
): InteractiveBlock[] {
  const title = section.title ?? "";
  const remaining = new Map(section.fields.map((field) => [field.id, field]));
  const blocks: InteractiveBlock[] = [];
  const consume = (fields: CharacterField[]) => {
    for (const field of fields) remaining.delete(field.id);
  };

  const families = fieldFamilies(section.fields);
  const resourceTracks: InteractiveResourceTrack[] = [];
  for (const family of families) {
    if (!looksLikeResource(family.fields, title)) continue;
    const current =
      family.fields.find((field) => fieldRole(field) === "current") ?? null;
    const maximum =
      family.fields.find((field) => fieldRole(field) === "maximum") ?? null;
    if (!current && !maximum && family.fields.length < 2) continue;
    resourceTracks.push({
      id: family.id,
      label: rowLabel(family.fields),
      fields: family.fields,
      current: current ?? family.fields[0] ?? null,
      maximum: maximum ?? family.fields[1] ?? null,
    });
    consume(family.fields);
  }
  if (resourceTracks.length) {
    blocks.push({
      kind: "resources",
      id: `${section.id}-resources`,
      tracks: resourceTracks,
    });
  }

  for (const family of families) {
    const available = family.fields.filter((field) => remaining.has(field.id));
    if (available.length < 4) continue;
    const table = buildRepeatedTable(`${section.id}-${family.id}`, available);
    if (!table) continue;
    blocks.push(table);
    consume(available);
  }
  if (sectionPatterns.table.test(title)) {
    const available = [...remaining.values()];
    const table = buildRepeatedTable(`${section.id}-table`, available);
    if (table) {
      blocks.push(table);
      consume(available);
    }
  }

  const multiline = [...remaining.values()].filter(
    (field) => field.kind === "multiline",
  );
  if (multiline.length) {
    blocks.push({ kind: "text", id: `${section.id}-text`, fields: multiline });
    consume(multiline);
  }

  if (sectionPatterns.stats.test(title)) {
    const available = [...remaining.values()].filter(
      (field) =>
        field.kind !== "radio" &&
        field.kind !== "dropdown" &&
        field.kind !== "list",
    );
    if (available.length) {
      blocks.push({
        kind: "stats",
        id: `${section.id}-stats`,
        rows: buildSemanticRows(available),
      });
      consume(available);
    }
  } else if (sectionPatterns.skills.test(title)) {
    const available = [...remaining.values()].filter(
      (field) =>
        field.kind !== "radio" &&
        field.kind !== "dropdown" &&
        field.kind !== "list",
    );
    if (available.length) {
      blocks.push({
        kind: "skills",
        id: `${section.id}-skills`,
        rows: buildSemanticRows(available),
      });
      consume(available);
    }
  } else {
    const statFields: CharacterField[] = [];
    const skillFields: CharacterField[] = [];
    for (const family of fieldFamilies([...remaining.values()])) {
      if (looksLikeSkill(family.fields)) skillFields.push(...family.fields);
      else if (looksLikeStat(family.fields)) statFields.push(...family.fields);
    }
    if (statFields.length) {
      blocks.push({
        kind: "stats",
        id: `${section.id}-stats`,
        rows: buildSemanticRows(statFields),
      });
      consume(statFields);
    }
    if (skillFields.length) {
      blocks.push({
        kind: "skills",
        id: `${section.id}-skills`,
        rows: buildSemanticRows(skillFields),
      });
      consume(skillFields);
    }
  }

  const options = [...remaining.values()].filter(
    (field) =>
      field.kind === "radio" ||
      field.kind === "dropdown" ||
      field.kind === "list",
  );
  if (options.length) {
    blocks.push({
      kind: "options",
      id: `${section.id}-options`,
      fields: options,
    });
    consume(options);
  }

  const ordinary = [...remaining.values()];
  if (ordinary.length) {
    blocks.push({
      kind: sectionPatterns.text.test(title) ? "text" : "fields",
      id: `${section.id}-fields`,
      fields: ordinary,
    });
  }
  return blocks;
}

export function buildInteractiveLayout(
  fields: CharacterField[],
): InteractiveLayoutSection[] {
  return arrangeInteractiveSections(fields).map((section) => ({
    ...section,
    blocks: buildSectionBlocks(section),
  }));
}

function fieldOptions(field: CharacterField): string[] {
  return [
    ...new Set([
      ...field.options,
      ...field.widgets.flatMap((widget) =>
        widget.exportValue ? [widget.exportValue] : [],
      ),
    ]),
  ];
}

interface ControlProps {
  field: CharacterField;
  active: boolean;
  compact?: boolean;
  hideLabel?: boolean;
  remoteCollaborator?: { username?: string; displayName?: string | null };
  onChange: (value: FieldValue) => void;
  onFocus: () => void;
  onBlur: () => void;
}

function InteractiveFieldControl({
  field,
  active,
  compact = false,
  hideLabel = false,
  remoteCollaborator,
  onChange,
  onFocus,
  onBlur,
}: ControlProps) {
  const t = useTranslations("Editor");
  const id = `interactive-character-field-${field.id}`;
  const options = fieldOptions(field);
  const controlClassName = cn(
    "w-full rounded-[var(--radius-control)] border bg-[var(--surface-strong)] text-[var(--foreground)] outline-none transition-colors",
    compact ? "h-10 px-2 text-center text-sm font-bold" : "h-11 px-3 text-sm",
    "border-[var(--border)] focus:border-[var(--brand)] focus:ring-3 focus:ring-[var(--brand-soft)]",
    active && "border-[var(--brand)] ring-3 ring-[var(--brand-soft)]",
    remoteCollaborator && "border-amber-500 ring-3 ring-amber-100",
  );
  const label = hideLabel ? null : (
    <label htmlFor={id} className="text-sm font-semibold leading-5">
      {field.label}
    </label>
  );
  const collaborator = remoteCollaborator ? (
    <span className="text-xs font-medium text-amber-700">
      {t("collaboratingNow", {
        name:
          remoteCollaborator.displayName ??
          remoteCollaborator.username ??
          t("anotherEditor"),
      })}
    </span>
  ) : null;

  if (field.kind === "checkbox") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-strong)]",
          compact ? "size-10 justify-center p-2" : "min-h-12 px-3 py-2.5",
          active && "border-[var(--brand)] ring-3 ring-[var(--brand-soft)]",
          remoteCollaborator && "border-amber-500 ring-3 ring-amber-100",
        )}
      >
        <input
          id={id}
          aria-label={hideLabel ? field.label : undefined}
          className="size-5 shrink-0 cursor-pointer accent-[var(--brand)]"
          type="checkbox"
          checked={field.value === true}
          onChange={(event) => onChange(event.target.checked)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        {!compact && (
          <div className="flex min-w-0 flex-1 flex-col">
            {label}
            {collaborator}
          </div>
        )}
      </div>
    );
  }

  if (field.kind === "radio") {
    return (
      <fieldset className="flex flex-col gap-2">
        {!hideLabel && (
          <legend className="text-sm font-semibold leading-5">
            {field.label}
          </legend>
        )}
        {collaborator}
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <label
              key={option}
              className={cn(
                "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm",
                field.value === option &&
                  "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]",
              )}
            >
              <input
                name={id}
                type="radio"
                aria-label={hideLabel ? `${field.label}: ${option}` : undefined}
                className="accent-[var(--brand)]"
                checked={field.value === option}
                onChange={() => onChange(option)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.kind === "dropdown" || field.kind === "list") {
    const multiple = field.kind === "list";
    const value = multiple
      ? Array.isArray(field.value)
        ? field.value
        : typeof field.value === "string"
          ? [field.value]
          : []
      : typeof field.value === "string"
        ? field.value
        : "";
    return (
      <div className="flex flex-col gap-2">
        {label}
        {collaborator}
        <select
          id={id}
          aria-label={hideLabel ? field.label : undefined}
          multiple={multiple}
          className={cn(
            controlClassName,
            multiple && "min-h-28 py-2 text-left font-normal",
          )}
          value={value}
          onChange={(event) =>
            onChange(
              multiple
                ? [...event.target.selectedOptions].map(
                    (option) => option.value,
                  )
                : event.target.value,
            )
          }
          onFocus={onFocus}
          onBlur={onBlur}
        >
          {!multiple && <option value="" />}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.kind === "multiline") {
    return (
      <div className="flex h-full flex-col gap-2">
        {label}
        {collaborator}
        <textarea
          id={id}
          aria-label={hideLabel ? field.label : undefined}
          className={cn(
            controlClassName,
            "min-h-36 flex-1 resize-y py-3 text-left font-normal leading-6",
          )}
          value={typeof field.value === "string" ? field.value : ""}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </div>
    );
  }

  if (
    field.kind === "button" ||
    field.kind === "signature" ||
    field.kind === "unknown"
  ) {
    return (
      <div className="flex flex-col gap-2">
        {label}
        <div className="flex min-h-11 items-center rounded-[var(--radius-control)] border border-dashed border-[var(--border)] bg-[var(--slate)]/45 px-3 text-sm text-[var(--muted)]">
          {t("unsupportedField")}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {label}
      {collaborator}
      <input
        id={id}
        aria-label={hideLabel ? field.label : undefined}
        className={controlClassName}
        value={typeof field.value === "string" ? field.value : ""}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </div>
  );
}

interface RenderContext {
  activeFieldId: string | null;
  remoteCollaboratorsByFieldId: Map<
    string,
    { username?: string; displayName?: string | null }
  >;
  onFieldChange: (fieldId: string, value: FieldValue) => void;
  onFieldFocus: (fieldId: string) => void;
  onFieldBlur: (fieldId: string) => void;
}

function control(
  field: CharacterField,
  context: RenderContext,
  options?: { compact?: boolean; hideLabel?: boolean },
) {
  return (
    <InteractiveFieldControl
      key={field.id}
      field={field}
      active={context.activeFieldId === field.id}
      compact={options?.compact}
      hideLabel={options?.hideLabel}
      remoteCollaborator={context.remoteCollaboratorsByFieldId.get(field.id)}
      onChange={(value) => context.onFieldChange(field.id, value)}
      onFocus={() => context.onFieldFocus(field.id)}
      onBlur={() => context.onFieldBlur(field.id)}
    />
  );
}

function StatsBlock({
  rows,
  context,
}: {
  rows: InteractiveFieldRow[];
  context: RenderContext;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        const primary =
          row.fields.find((field) => fieldRole(field) === "score") ??
          row.fields.find((field) => fieldRole(field) === "other") ??
          row.fields[0];
        const secondary = row.fields.filter((field) => field !== primary);
        return (
          <article
            key={row.id}
            className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-strong)] p-3 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <h3 className="min-w-0 flex-1 pt-2 text-sm font-extrabold tracking-wide uppercase">
                {row.label}
              </h3>
              {primary && (
                <div className="w-20">
                  {control(primary, context, {
                    compact: true,
                    hideLabel: true,
                  })}
                </div>
              )}
            </div>
            {secondary.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3">
                {secondary.map((field) => (
                  <div key={field.id} className="min-w-0">
                    <span className="mb-1 block truncate text-[0.65rem] font-bold tracking-wide text-[var(--muted)] uppercase">
                      {field.label}
                    </span>
                    {control(field, context, {
                      compact: true,
                      hideLabel: true,
                    })}
                  </div>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function SkillsBlock({
  rows,
  context,
}: {
  rows: InteractiveFieldRow[];
  context: RenderContext;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {rows.map((row) => {
        const proficiency = row.fields.find(
          (field) =>
            fieldRole(field) === "proficiency" || field.kind === "checkbox",
        );
        const values = row.fields.filter((field) => field !== proficiency);
        return (
          <div
            key={row.id}
            className="flex min-h-14 items-center gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-strong)] p-2.5"
          >
            {proficiency &&
              control(proficiency, context, { compact: true, hideLabel: true })}
            <span className="min-w-0 flex-1 text-sm font-bold">
              {row.label}
            </span>
            {values.map((field) => (
              <div key={field.id} className="w-20 shrink-0">
                {control(field, context, { compact: true, hideLabel: true })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function numericValue(field: CharacterField | null) {
  if (!field || typeof field.value !== "string" || field.value.trim() === "")
    return null;
  const value = Number(field.value);
  return Number.isFinite(value) ? value : null;
}

function ResourcesBlock({
  tracks,
  context,
}: {
  tracks: InteractiveResourceTrack[];
  context: RenderContext;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tracks.map((track) => {
        const current = numericValue(track.current);
        const maximum = numericValue(track.maximum);
        const progress =
          current !== null && maximum !== null && maximum > 0
            ? Math.min(100, Math.max(0, (current / maximum) * 100))
            : null;
        return (
          <article
            key={track.id}
            className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-strong)] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-extrabold tracking-wide uppercase">
                {track.label}
              </h3>
              {current !== null && maximum !== null && (
                <span className="text-sm font-bold tabular-nums">
                  {current}/{maximum}
                </span>
              )}
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--slate)]"
              role={progress === null ? undefined : "progressbar"}
              aria-label={progress === null ? undefined : track.label}
              aria-valuemin={progress === null ? undefined : 0}
              aria-valuemax={progress === null ? undefined : 100}
              aria-valuenow={
                progress === null ? undefined : Math.round(progress)
              }
            >
              {progress !== null && (
                <div
                  className="h-full rounded-full bg-[var(--brand)]"
                  style={{ width: `${progress}%` }}
                />
              )}
            </div>
            <div
              className={cn(
                "mt-3 grid gap-2",
                track.fields.length > 1 && "grid-cols-2",
              )}
            >
              {track.fields.map((field) => control(field, context))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function tableGridClass(columnCount: number) {
  if (columnCount <= 1) return "md:grid-cols-1";
  if (columnCount === 2) return "md:grid-cols-2";
  if (columnCount === 3) return "md:grid-cols-3";
  if (columnCount === 4) return "md:grid-cols-2 xl:grid-cols-4";
  if (columnCount === 5) return "md:grid-cols-2 xl:grid-cols-5";
  return "md:grid-cols-3 xl:grid-cols-6";
}

function TableBlock({
  block,
  context,
}: {
  block: Extract<InteractiveBlock, { kind: "table" }>;
  context: RenderContext;
}) {
  const columns = Math.max(
    block.columns.length,
    ...block.rows.map((row) => row.fields.length),
  );
  const gridClass = tableGridClass(columns);
  return (
    <div
      role="table"
      className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-strong)]"
    >
      <div
        role="row"
        className={cn(
          "hidden gap-3 bg-[var(--slate)]/70 px-3 py-2 md:grid",
          gridClass,
        )}
      >
        {block.columns.map((column, index) => (
          <span
            role="columnheader"
            key={`${column}-${index}`}
            className="text-xs font-bold tracking-wide text-[var(--muted)] uppercase"
          >
            {column}
          </span>
        ))}
      </div>
      {block.rows.map((row) => (
        <div
          role="row"
          key={row.id}
          className={cn(
            "grid grid-cols-1 gap-3 border-t border-[var(--border)] p-3 first:border-t-0",
            gridClass,
          )}
        >
          {row.fields.map((field) => (
            <div role="cell" key={field.id} className="min-w-0">
              <span className="mb-1 block text-xs font-bold text-[var(--muted)] md:hidden">
                {columnLabel(field)}
              </span>
              {control(field, context, { hideLabel: true })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function renderBlock(
  block: InteractiveBlock,
  context: RenderContext,
): ReactNode {
  if (block.kind === "stats")
    return <StatsBlock key={block.id} rows={block.rows} context={context} />;
  if (block.kind === "skills")
    return <SkillsBlock key={block.id} rows={block.rows} context={context} />;
  if (block.kind === "resources")
    return (
      <ResourcesBlock key={block.id} tracks={block.tracks} context={context} />
    );
  if (block.kind === "table")
    return <TableBlock key={block.id} block={block} context={context} />;
  return (
    <div
      key={block.id}
      className={cn(
        "grid grid-cols-1 gap-4",
        block.kind === "text"
          ? "lg:grid-cols-2"
          : "md:grid-cols-2 xl:grid-cols-3",
      )}
    >
      {block.fields.map((field) => (
        <div
          key={field.id}
          className={cn(
            block.kind === "text" &&
              "rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-strong)] p-4",
          )}
        >
          {control(field, context)}
        </div>
      ))}
    </div>
  );
}

export function InteractiveCharacterSheet({
  fields,
  activeFieldId,
  remoteCollaboratorsByFieldId,
  onFieldChange,
  onFieldFocus,
  onFieldBlur,
}: {
  fields: CharacterField[];
  activeFieldId: string | null;
  remoteCollaboratorsByFieldId: Map<
    string,
    { username?: string; displayName?: string | null }
  >;
  onFieldChange: (fieldId: string, value: FieldValue) => void;
  onFieldFocus: (fieldId: string) => void;
  onFieldBlur: (fieldId: string) => void;
}) {
  const t = useTranslations("Editor");
  const sections = useMemo(() => buildInteractiveLayout(fields), [fields]);
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "");

  const activeSection =
    sections.find((section) => section.id === activeSectionId) ?? sections[0];
  const context: RenderContext = {
    activeFieldId,
    remoteCollaboratorsByFieldId,
    onFieldChange,
    onFieldFocus,
    onFieldBlur,
  };

  return (
    <div className="mx-auto flex w-full max-w-[120rem] flex-col gap-3 p-2 sm:gap-4 sm:p-4 lg:p-6">
      <header className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
        <p className="text-xs font-bold tracking-[0.16em] text-[var(--brand)] uppercase">
          {t("adaptiveEyebrow")}
        </p>
        <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
          {t("adaptiveTitle")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          {t("adaptiveDescription")}
        </p>
      </header>

      {sections.length > 0 && (
        <div className="sticky top-0 z-10 -mx-2 overflow-x-auto border-y border-[var(--border)] bg-[var(--background)]/95 px-2 py-2 backdrop-blur sm:mx-0 sm:rounded-[var(--radius-card)] sm:border sm:px-3">
          <div
            role="tablist"
            aria-label={t("adaptiveTitle")}
            className="flex min-w-max gap-2"
          >
            {sections.map((section) => {
              const selected = section.id === activeSection?.id;
              const label = section.title ?? t("otherFields");
              return (
                <button
                  key={section.id}
                  id={`interactive-section-tab-${section.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`interactive-section-panel-${section.id}`}
                  className={cn(
                    "min-h-10 rounded-full border px-4 text-sm font-bold outline-none transition-colors focus:ring-3 focus:ring-[var(--brand-soft)]",
                    selected
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]",
                  )}
                  onClick={() => setActiveSectionId(section.id)}
                >
                  {label}
                  <span className="ml-2 text-xs opacity-75">
                    {section.fields.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeSection && (
        <section
          id={`interactive-section-panel-${activeSection.id}`}
          role="tabpanel"
          aria-labelledby={`interactive-section-tab-${activeSection.id}`}
          className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm sm:p-5 lg:p-6"
        >
          <div className="mb-4 flex items-center gap-3 border-b border-[var(--border)] pb-3">
            <h2 className="text-base font-bold sm:text-lg">
              {activeSection.title ?? t("otherFields")}
            </h2>
            <span className="rounded-full bg-[var(--slate)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
              {activeSection.fields.length}
            </span>
          </div>
          <div className="flex flex-col gap-5">
            {activeSection.blocks.map((block) => renderBlock(block, context))}
          </div>
        </section>
      )}
    </div>
  );
}
