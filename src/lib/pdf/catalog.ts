import { randomUUID } from "node:crypto";
import type { FieldKind, FieldValue } from "@/lib/types";

export interface TextToken {
  text: string;
  page: number;
  rect: [number, number, number, number];
  fontSize: number;
  source: "pdf" | "ocr";
}

export interface CatalogWidget {
  page: number;
  rect: [number, number, number, number];
  pdfRect: [number, number, number, number];
  rotation: number;
  exportValue: string | null;
  widgetIndex: number;
}

export interface ExtractedCatalogField {
  id: string;
  pdfName: string;
  kind: FieldKind;
  defaultValue: FieldValue;
  options: string[];
  page: number;
  label: string;
  aliases: string[];
  section: string | null;
  groupId: string | null;
  groupOrder: number | null;
  confidence: number;
  source: "pdf" | "heuristic" | "ocr" | "vision";
  widgets: CatalogWidget[];
}

interface PdfAnnotation {
  subtype?: string;
  fieldName?: string;
  fieldType?: string;
  fieldValue?: unknown;
  rect?: number[];
  checkBox?: boolean;
  radioButton?: boolean;
  combo?: boolean;
  multiLine?: boolean;
  multiSelect?: boolean;
  options?: Array<{ displayValue?: string; exportValue?: string } | string>;
  buttonValue?: string;
}

interface PdfTextItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
}

function isTextItem(item: unknown): item is PdfTextItem {
  return Boolean(
    item && typeof item === "object" && "str" in item && "transform" in item,
  );
}

export function mapAnnotationKind(annotation: PdfAnnotation): FieldKind {
  if (annotation.fieldType === "Tx")
    return annotation.multiLine ? "multiline" : "text";
  if (annotation.fieldType === "Btn") {
    if (annotation.checkBox) return "checkbox";
    if (annotation.radioButton) return "radio";
    return "button";
  }
  if (annotation.fieldType === "Ch") {
    if (annotation.combo) return "dropdown";
    return "list";
  }
  if (annotation.fieldType === "Sig") return "signature";
  return "unknown";
}

export function normalizeFieldValue(
  annotation: PdfAnnotation,
  kind: FieldKind,
): FieldValue {
  const value = annotation.fieldValue;
  if (value === undefined || value === null || value === "") return null;
  if (kind === "checkbox") return value !== "Off" && value !== false;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "boolean") return value;
  return String(value);
}

function getOptions(annotation: PdfAnnotation) {
  return (annotation.options ?? [])
    .map((option) =>
      typeof option === "string"
        ? option
        : (option.displayValue ?? option.exportValue ?? ""),
    )
    .filter(Boolean);
}

export function scoreLabelCandidate(
  fieldRect: [number, number, number, number],
  token: TextToken,
) {
  const [left, top, right, bottom] = fieldRect;
  const [tokenLeft, tokenTop, tokenRight, tokenBottom] = token.rect;
  const fieldWidth = right - left;
  const fieldHeight = bottom - top;
  const verticalOverlap = Math.max(
    0,
    Math.min(bottom, tokenBottom) - Math.max(top, tokenTop),
  );
  const horizontalOverlap = Math.max(
    0,
    Math.min(right, tokenRight) - Math.max(left, tokenLeft),
  );
  const leftGap = left - tokenRight;
  const aboveGap = top - tokenBottom;
  let score = 0;

  if (leftGap >= -0.05 && leftGap <= 0.22 && verticalOverlap > 0) {
    score =
      0.72 -
      leftGap * 1.45 +
      Math.min(0.12, verticalOverlap / Math.max(fieldHeight, 0.01) / 8);
  }
  if (aboveGap >= -0.005 && aboveGap <= 0.1 && horizontalOverlap > 0) {
    score = Math.max(
      score,
      0.68 -
        aboveGap * 2.2 +
        Math.min(0.12, horizontalOverlap / Math.max(fieldWidth, 0.01) / 8),
    );
  }
  if (token.text.length > 80) score -= 0.18;
  if (/^\d+[.,]?\d*$/.test(token.text.trim())) score -= 0.25;
  return Math.max(0, Math.min(1, score));
}

export function assignLabels(
  fields: ExtractedCatalogField[],
  tokens: TextToken[],
) {
  return fields.map((field) => {
    const widget = field.widgets[0];
    const candidates = tokens
      .filter(
        (token) => token.page === widget.page && token.text.trim().length > 0,
      )
      .map((token) => ({
        token,
        score: scoreLabelCandidate(widget.rect, token),
      }))
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || best.score < 0.42 || best.score <= field.confidence)
      return field;

    const pageTokens = tokens.filter(
      (token) => token.page === widget.page && token.rect[3] <= widget.rect[1],
    );
    const medianFont = pageTokens.length
      ? [...pageTokens].sort((a, b) => a.fontSize - b.fontSize)[
          Math.floor(pageTokens.length / 2)
        ].fontSize
      : 0;
    const section =
      pageTokens
        .filter(
          (token) =>
            token.fontSize >= medianFont * 1.25 && token.text.length < 80,
        )
        .sort((a, b) => b.rect[1] - a.rect[1])[0]
        ?.text?.trim() ?? null;

    return {
      ...field,
      label: best.token.text.trim(),
      section,
      confidence: best.score,
      source:
        best.token.source === "ocr" ? ("ocr" as const) : ("heuristic" as const),
    };
  });
}

export function assignSpatialGroups(fields: ExtractedCatalogField[]) {
  const result = fields.map((field) => ({ ...field }));
  const buckets = new Map<string, ExtractedCatalogField[]>();
  for (const field of result) {
    if (!["text", "multiline"].includes(field.kind)) continue;
    const widget = field.widgets[0];
    const column = Math.round(widget.rect[0] * 10);
    const key = `${field.page}:${field.section ?? ""}:${column}`;
    buckets.set(key, [...(buckets.get(key) ?? []), field]);
  }

  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.widgets[0].rect[1] - b.widgets[0].rect[1]);
    let run: ExtractedCatalogField[] = [];
    const commit = () => {
      if (run.length < 2) return;
      const groupId = randomUUID();
      run.forEach((field, index) => {
        const target = result.find((candidate) => candidate.id === field.id);
        if (target) {
          target.groupId = groupId;
          target.groupOrder = index;
        }
      });
    };
    for (const field of bucket) {
      const previous = run.at(-1);
      const gap = previous
        ? field.widgets[0].rect[1] - previous.widgets[0].rect[3]
        : 0;
      if (previous && gap > 0.13) {
        commit();
        run = [];
      }
      run.push(field);
    }
    commit();
  }
  return result;
}

export async function extractPdfCatalog(bytes: Uint8Array) {
  const canvasModule = await import("@napi-rs/canvas");
  Object.assign(globalThis, {
    DOMMatrix: canvasModule.DOMMatrix,
    ImageData: canvasModule.ImageData,
    Path2D: canvasModule.Path2D,
  });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
  }).promise;
  const fieldsByName = new Map<string, ExtractedCatalogField>();
  const tokens: TextToken[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const annotations = (await page.getAnnotations({
      intent: "any",
    })) as PdfAnnotation[];
    const text = await page.getTextContent();

    for (const raw of text.items) {
      if (!isTextItem(raw) || !raw.str.trim()) continue;
      const transform = pdfjs.Util.transform(viewport.transform, raw.transform);
      const left = transform[4] / viewport.width;
      const bottom = transform[5] / viewport.height;
      const width = raw.width / viewport.width;
      const height =
        Math.max(raw.height, Math.abs(transform[3])) / viewport.height;
      tokens.push({
        text: raw.str.trim(),
        page: pageNumber,
        rect: [left, bottom - height, left + width, bottom],
        fontSize: Math.abs(transform[3]),
        source: "pdf",
      });
    }

    for (const annotation of annotations) {
      if (
        annotation.subtype !== "Widget" ||
        !annotation.fieldName ||
        !annotation.rect
      )
        continue;
      const first = viewport.convertToViewportPoint(
        annotation.rect[0],
        annotation.rect[1],
      );
      const second = viewport.convertToViewportPoint(
        annotation.rect[2],
        annotation.rect[3],
      );
      const converted = [first[0], first[1], second[0], second[1]];
      const x1 = Math.min(converted[0], converted[2]) / viewport.width;
      const x2 = Math.max(converted[0], converted[2]) / viewport.width;
      const y1 = Math.min(converted[1], converted[3]) / viewport.height;
      const y2 = Math.max(converted[1], converted[3]) / viewport.height;
      const widget: CatalogWidget = {
        page: pageNumber,
        rect: [x1, y1, x2, y2],
        pdfRect: annotation.rect.slice(0, 4) as [
          number,
          number,
          number,
          number,
        ],
        rotation: viewport.rotation,
        exportValue: annotation.buttonValue ?? null,
        widgetIndex:
          fieldsByName.get(annotation.fieldName)?.widgets.length ?? 0,
      };
      const existing = fieldsByName.get(annotation.fieldName);
      if (existing) {
        existing.widgets.push(widget);
        continue;
      }
      const kind = mapAnnotationKind(annotation);
      fieldsByName.set(annotation.fieldName, {
        id: randomUUID(),
        pdfName: annotation.fieldName,
        kind,
        defaultValue: normalizeFieldValue(annotation, kind),
        options: getOptions(annotation),
        page: pageNumber,
        label: annotation.fieldName,
        aliases: [],
        section: null,
        groupId: null,
        groupOrder: null,
        confidence: 0,
        source: "pdf",
        widgets: [widget],
      });
    }
  }

  const labeled = assignLabels([...fieldsByName.values()], tokens);
  return {
    pageCount: document.numPages,
    fields: assignSpatialGroups(labeled),
    tokens,
  };
}
