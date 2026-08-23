import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  RGB,
} from "pdf-lib";
import type {
  CharacterRepeaterRow,
  ComponentVersionDetails,
  FieldValue,
  LayoutNode,
} from "@mycharacter/contracts";

export interface GenerateSheetPdfOptions {
  layout: LayoutNode;
  fieldValues?: Record<string, FieldValue>;
  repeaterRows?: Record<string, CharacterRepeaterRow[]>;
  resolvedComponents?: Record<string, ComponentVersionDetails>;
  title?: string;
}

// A4 Dimensions in points: 595.28 x 841.89
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const DEFAULT_MARGIN = 25;

function parseColorToken(token?: string | null, fallback: RGB = rgb(0.13, 0.13, 0.13)): RGB | null {
  if (!token || token === "none" || token === "transparent") return null;
  if (token === "subtle") return rgb(0.55, 0.55, 0.55);
  if (token === "primary") return rgb(0.06, 0.24, 0.09);
  if (token === "accent") return rgb(0.25, 0.40, 0.44);
  if (token === "danger") return rgb(0.70, 0.28, 0.25);
  if (token === "gold") return rgb(0.72, 0.53, 0.04);
  if (token === "parchment") return rgb(0.98, 0.96, 0.93);
  if (token === "surface" || token === "card") return rgb(1, 1, 1);
  if (token === "surface-subtle") return rgb(0.96, 0.97, 0.96);
  if (token === "dark") return rgb(0.12, 0.14, 0.13);
  if (token === "accent-subtle") return rgb(0.91, 0.95, 0.96);
  return fallback;
}

interface FontSet {
  titleFont: PDFFont;
  titleBoldFont: PDFFont;
  bodyFont: PDFFont;
  bodyBoldFont: PDFFont;
}

async function loadBundledFonts(doc: PDFDocument): Promise<FontSet> {
  const require = createRequire(import.meta.url);
  const montserratMediumPath = require.resolve(
    "@fontsource/montserrat-alternates/files/montserrat-alternates-cyrillic-500-normal.woff",
  );
  const montserratBoldPath = require.resolve(
    "@fontsource/montserrat-alternates/files/montserrat-alternates-cyrillic-700-normal.woff",
  );
  const notoRegularPath = require.resolve(
    "@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff",
  );
  const notoBoldPath = require.resolve(
    "@fontsource/noto-sans/files/noto-sans-cyrillic-600-normal.woff",
  );

  const [montserratMediumBytes, montserratBoldBytes, notoRegularBytes, notoBoldBytes] =
    await Promise.all([
      readFile(montserratMediumPath),
      readFile(montserratBoldPath),
      readFile(notoRegularPath),
      readFile(notoBoldPath),
    ]);

  doc.registerFontkit(fontkit);

  const [titleFont, titleBoldFont, bodyFont, bodyBoldFont] = await Promise.all([
    doc.embedFont(montserratMediumBytes, { subset: true }),
    doc.embedFont(montserratBoldBytes, { subset: true }),
    doc.embedFont(notoRegularBytes, { subset: true }),
    doc.embedFont(notoBoldBytes, { subset: true }),
  ]);

  return { titleFont, titleBoldFont, bodyFont, bodyBoldFont };
}

class PdfRenderContext {
  public doc: PDFDocument;
  public page: PDFPage;
  public fonts: FontSet;
  public fieldValues: Record<string, FieldValue>;
  public repeaterRows: Record<string, CharacterRepeaterRow[]>;
  public resolvedComponents: Record<string, ComponentVersionDetails>;
  public currentY: number;

  constructor(
    doc: PDFDocument,
    page: PDFPage,
    fonts: FontSet,
    options: GenerateSheetPdfOptions,
  ) {
    this.doc = doc;
    this.page = page;
    this.fonts = fonts;
    this.fieldValues = options.fieldValues ?? {};
    this.repeaterRows = options.repeaterRows ?? {};
    this.resolvedComponents = options.resolvedComponents ?? {};
    this.currentY = PAGE_HEIGHT - DEFAULT_MARGIN;
  }

  public addPage(): PDFPage {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.currentY = PAGE_HEIGHT - DEFAULT_MARGIN;
    return this.page;
  }
}

export async function generateA4SheetPdf(
  options: GenerateSheetPdfOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (options.title) {
    doc.setTitle(options.title);
  }

  const fonts = await loadBundledFonts(doc);
  const initialPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const ctx = new PdfRenderContext(doc, initialPage, fonts, options);

  const usableWidth = PAGE_WIDTH - DEFAULT_MARGIN * 2;
  const layout = options.layout;

  renderNode(ctx, layout, DEFAULT_MARGIN, ctx.currentY, usableWidth);

  return doc.save();
}

function renderNode(
  ctx: PdfRenderContext,
  node: LayoutNode,
  x: number,
  y: number,
  availableWidth: number,
): number {
  switch (node.kind) {
    case "frame":
      return renderFrameNode(ctx, node, x, y, availableWidth);
    case "text":
      return renderTextNode(ctx, node, x, y, availableWidth);
    case "field-input":
      return renderFieldInputNode(ctx, node, x, y, availableWidth);
    case "number-input":
      return renderNumberInputNode(ctx, node, x, y, availableWidth);
    case "textarea":
      return renderTextareaNode(ctx, node, x, y, availableWidth);
    case "checkbox":
      return renderCheckboxNode(ctx, node, x, y, availableWidth);
    case "select":
      return renderSelectNode(ctx, node, x, y, availableWidth);
    case "divider":
      return renderDividerNode(ctx, node, x, y, availableWidth);
    case "spacer":
      return renderSpacerNode(ctx, node, x, y, availableWidth);
    case "image":
      return renderImageNode(ctx, node, x, y, availableWidth);
    case "repeater":
      return renderRepeaterNode(ctx, node, x, y, availableWidth);
    case "component-instance":
      return renderComponentInstanceNode(ctx, node, x, y, availableWidth);
    default: {
      const unsupported = node as { kind?: string };
      throw new Error(`Unsupported LayoutNode kind in PDF export: ${unsupported.kind}`);
    }
  }
}

function estimateNodeHeight(
  ctx: PdfRenderContext,
  node: LayoutNode,
  availableWidth: number,
): number {
  switch (node.kind) {
    case "text": {
      const fontSize = node.fontSize ?? (node.variant === "title" ? 16 : node.variant === "display" ? 22 : node.variant === "caption" ? 9 : 11);
      const isTitle = node.variant === "title" || node.variant === "display" || node.fontFamily === "Montserrat Alternates";
      const font = isTitle ? ctx.fonts.titleFont : ctx.fonts.bodyFont;
      const lines = wrapText(font, node.text || " ", fontSize, availableWidth);
      return lines.length * fontSize * (node.lineHeight ?? 1.3) + 4;
    }
    case "field-input":
      return 36;
    case "number-input":
      return 42;
    case "textarea":
      return (node.rows ?? 3) * 16 + 24;
    case "checkbox":
      return 20;
    case "select":
      return 36;
    case "divider":
      return (node.strokeWidth ?? 1) + 8;
    case "spacer":
      return node.size ?? 8;
    case "image":
      return 80;
    case "frame":
    case "repeater":
    case "component-instance":
      return 60;
    default:
      return 30;
  }
}

function renderFrameNode(
  ctx: PdfRenderContext,
  node: LayoutNode & { kind: "frame" },
  x: number,
  y: number,
  availableWidth: number,
): number {
  const pad = node.box?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const gap = node.gap ?? 8;
  const innerWidth = Math.max(10, availableWidth - pad.left - pad.right);

  const startY = y;
  let contentY = y - pad.top;

  // Title dock if present
  let titleBadgeHeight = 0;
  if (node.titleDock && node.titleDock.dock !== "none" && node.titleDock.text) {
    const titleText = node.titleDock.text;
    const font = ctx.fonts.titleBoldFont;
    const titleSize = 10;
    const textWidth = font.widthOfTextAtSize(titleText, titleSize);

    const badgeX = x + pad.left;
    const badgeY = contentY - 14;
    ctx.page.drawRectangle({
      x: badgeX,
      y: badgeY,
      width: Math.min(innerWidth, textWidth + 16),
      height: 16,
      color: rgb(0.06, 0.24, 0.09),
    });
    ctx.page.drawText(titleText, {
      x: badgeX + 8,
      y: badgeY + 4,
      size: titleSize,
      font,
      color: rgb(1, 1, 1),
    });
    titleBadgeHeight = 22;
    contentY -= titleBadgeHeight;
  }

  // Precalculate children height
  let estimatedChildrenHeight = 0;
  if (node.direction === "horizontal" && node.children.length > 0) {
    const totalGaps = gap * (node.children.length - 1);
    const colWidth = Math.max(10, (innerWidth - totalGaps) / node.children.length);
    for (const child of node.children) {
      const h = estimateNodeHeight(ctx, child, colWidth);
      if (h > estimatedChildrenHeight) estimatedChildrenHeight = h;
    }
  } else {
    for (const child of node.children) {
      estimatedChildrenHeight += estimateNodeHeight(ctx, child, innerWidth) + gap;
    }
  }

  const estimatedTotalHeight = Math.max(
    pad.top + titleBadgeHeight + estimatedChildrenHeight + pad.bottom,
    node.box?.height?.mode === "fixed" ? node.box.height.value : 20,
  );

  // Background fill and border stroke drawn underneath
  const fillColor = parseColorToken(node.box?.fill ?? "transparent");
  const strokeColor = parseColorToken(node.box?.strokeColor ?? "none");
  const strokeTop = node.box?.strokeWidth?.top ?? (strokeColor ? 1 : 0);

  if (fillColor) {
    ctx.page.drawRectangle({
      x,
      y: startY - estimatedTotalHeight,
      width: availableWidth,
      height: estimatedTotalHeight,
      color: fillColor,
    });
  }

  if (strokeColor && strokeTop > 0) {
    ctx.page.drawRectangle({
      x,
      y: startY - estimatedTotalHeight,
      width: availableWidth,
      height: estimatedTotalHeight,
      borderColor: strokeColor,
      borderWidth: strokeTop,
    });
  }

  // Draw ornament decorations if specified
  if (node.ornamentStyle && node.ornamentStyle !== "none") {
    const ornColor = strokeColor ?? rgb(0.6, 0.65, 0.6);
    const ornSize = 4;
    ctx.page.drawRectangle({
      x: x + 2,
      y: startY - 6,
      width: ornSize,
      height: ornSize,
      color: ornColor,
    });
    ctx.page.drawRectangle({
      x: x + availableWidth - 6,
      y: startY - 6,
      width: ornSize,
      height: ornSize,
      color: ornColor,
    });
  }

  // Render children
  if (node.direction === "horizontal" && node.children.length > 0) {
    const totalGaps = gap * (node.children.length - 1);
    const colWidth = Math.max(10, (innerWidth - totalGaps) / node.children.length);
    let maxChildHeight = 0;

    let childX = x + pad.left;
    for (const child of node.children) {
      const childHeight = renderNode(ctx, child, childX, contentY, colWidth);
      if (childHeight > maxChildHeight) maxChildHeight = childHeight;
      childX += colWidth + gap;
    }
    contentY -= maxChildHeight;
  } else {
    for (const child of node.children) {
      const childHeight = renderNode(ctx, child, x + pad.left, contentY, innerWidth);
      contentY -= childHeight + gap;
    }
    if (node.children.length > 0) {
      contentY += gap;
    }
  }

  const finalHeight = Math.max(startY - contentY + pad.bottom, estimatedTotalHeight);
  return finalHeight;
}

function renderTextNode(
  ctx: PdfRenderContext,
  node: LayoutNode & { kind: "text" },
  x: number,
  y: number,
  availableWidth: number,
): number {
  const isTitle = node.variant === "title" || node.variant === "display" || node.fontFamily === "Montserrat Alternates";
  const isBold = node.weight === "bold" || node.fontWeight === "700" || node.fontWeight === "bold";
  const font = isTitle
    ? isBold ? ctx.fonts.titleBoldFont : ctx.fonts.titleFont
    : isBold ? ctx.fonts.bodyBoldFont : ctx.fonts.bodyFont;

  const fontSize = node.fontSize ?? (node.variant === "title" ? 16 : node.variant === "display" ? 22 : node.variant === "caption" ? 9 : 11);
  const color = parseColorToken(node.color ?? "default", rgb(0.13, 0.13, 0.13))!;
  const rawText = node.uppercase ? (node.text || "").toUpperCase() : (node.text || "");

  if (!rawText) return fontSize + 4;

  const lines = wrapText(font, rawText, fontSize, availableWidth);
  let curY = y - fontSize;

  for (const line of lines) {
    let textX = x;
    if (node.align === "center") {
      const lineW = font.widthOfTextAtSize(line, fontSize);
      textX = x + Math.max(0, (availableWidth - lineW) / 2);
    } else if (node.align === "right") {
      const lineW = font.widthOfTextAtSize(line, fontSize);
      textX = x + Math.max(0, availableWidth - lineW);
    }

    ctx.page.drawText(line, {
      x: textX,
      y: curY,
      size: fontSize,
      font,
      color,
    });
    curY -= fontSize * (node.lineHeight ?? 1.3);
  }

  return (lines.length * fontSize * (node.lineHeight ?? 1.3)) + 4;
}

function renderFieldInputNode(
  ctx: PdfRenderContext,
  node: LayoutNode & { kind: "field-input" },
  x: number,
  y: number,
  availableWidth: number,
): number {
  const font = ctx.fonts.bodyFont;
  const labelFont = ctx.fonts.titleFont;
  const val = ctx.fieldValues[node.fieldBinding] ?? "";
  const displayVal = typeof val === "string" ? val : String(val ?? "");

  let curY = y;
  if (node.label) {
    ctx.page.drawText(node.label.toUpperCase(), {
      x,
      y: curY - 8,
      size: 8,
      font: labelFont,
      color: rgb(0.4, 0.45, 0.42),
    });
    curY -= 12;
  }

  const boxHeight = 18;
  const boxY = curY - boxHeight;

  if (node.variant === "boxed") {
    ctx.page.drawRectangle({
      x,
      y: boxY,
      width: availableWidth,
      height: boxHeight,
      borderColor: rgb(0.8, 0.82, 0.8),
      borderWidth: 1,
      color: rgb(0.98, 0.99, 0.98),
    });
  } else {
    ctx.page.drawLine({
      start: { x, y: boxY },
      end: { x: x + availableWidth, y: boxY },
      color: rgb(0.7, 0.73, 0.7),
      thickness: 1,
    });
  }

  if (displayVal) {
    ctx.page.drawText(displayVal, {
      x: x + 4,
      y: boxY + 4,
      size: 10,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  } else if (node.placeholder) {
    ctx.page.drawText(node.placeholder, {
      x: x + 4,
      y: boxY + 4,
      size: 9,
      font,
      color: rgb(0.65, 0.65, 0.65),
    });
  }

  return (y - boxY) + 6;
}

function renderNumberInputNode(
  ctx: PdfRenderContext,
  node: LayoutNode & { kind: "number-input" },
  x: number,
  y: number,
  availableWidth: number,
): number {
  const val = ctx.fieldValues[node.fieldBinding];
  let displayVal = val !== undefined && val !== null ? String(val) : "";
  if (node.showSign && Number(val) > 0) displayVal = `+${displayVal}`;

  let curY = y;
  if (node.label) {
    ctx.page.drawText(node.label.toUpperCase(), {
      x,
      y: curY - 8,
      size: 8,
      font: ctx.fonts.titleFont,
      color: rgb(0.4, 0.45, 0.42),
    });
    curY -= 12;
  }

  const boxSize = Math.min(36, availableWidth);
  const boxY = curY - boxSize;

  if (node.variant === "circle") {
    ctx.page.drawEllipse({
      x: x + boxSize / 2,
      y: boxY + boxSize / 2,
      xScale: boxSize / 2,
      yScale: boxSize / 2,
      borderColor: rgb(0.06, 0.24, 0.09),
      borderWidth: 1.5,
      color: rgb(0.98, 0.99, 0.98),
    });
  } else {
    ctx.page.drawRectangle({
      x,
      y: boxY,
      width: availableWidth,
      height: boxSize,
      borderColor: rgb(0.7, 0.73, 0.7),
      borderWidth: 1,
      color: rgb(0.98, 0.99, 0.98),
    });
  }

  if (displayVal) {
    const numFont = ctx.fonts.titleBoldFont;
    const numSize = 14;
    const textWidth = numFont.widthOfTextAtSize(displayVal, numSize);
    ctx.page.drawText(displayVal, {
      x: x + Math.max(0, (availableWidth - textWidth) / 2),
      y: boxY + (boxSize - numSize) / 2 + 2,
      size: numSize,
      font: numFont,
      color: rgb(0.06, 0.24, 0.09),
    });
  }

  return (y - boxY) + 6;
}

function renderTextareaNode(
  ctx: PdfRenderContext,
  node: LayoutNode & { kind: "textarea" },
  x: number,
  y: number,
  availableWidth: number,
): number {
  const font = ctx.fonts.bodyFont;
  const val = ctx.fieldValues[node.fieldBinding] ?? "";
  const displayVal = typeof val === "string" ? val : String(val ?? "");
  const rows = node.rows ?? 3;
  const boxHeight = rows * 16 + 8;

  let curY = y;
  if (node.label) {
    ctx.page.drawText(node.label.toUpperCase(), {
      x,
      y: curY - 8,
      size: 8,
      font: ctx.fonts.titleFont,
      color: rgb(0.4, 0.45, 0.42),
    });
    curY -= 12;
  }

  const boxY = curY - boxHeight;

  ctx.page.drawRectangle({
    x,
    y: boxY,
    width: availableWidth,
    height: boxHeight,
    borderColor: rgb(0.8, 0.82, 0.8),
    borderWidth: 1,
    color: rgb(0.99, 0.99, 0.99),
  });

  if (displayVal) {
    const lines = wrapText(font, displayVal, 9, availableWidth - 8);
    let lineY = boxY + boxHeight - 12;
    for (let i = 0; i < Math.min(lines.length, rows + 2); i++) {
      ctx.page.drawText(lines[i]!, {
        x: x + 4,
        y: lineY,
        size: 9,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      lineY -= 14;
    }
  } else if (node.placeholder) {
    ctx.page.drawText(node.placeholder, {
      x: x + 4,
      y: boxY + boxHeight - 12,
      size: 9,
      font,
      color: rgb(0.65, 0.65, 0.65),
    });
  }

  return (y - boxY) + 6;
}

function renderCheckboxNode(
  ctx: PdfRenderContext,
  node: LayoutNode & { kind: "checkbox" },
  x: number,
  y: number,
  _availableWidth: number,
): number {
  const val = ctx.fieldValues[node.fieldBinding];
  const isChecked = val === true || val === "true";
  const size = 12;
  const boxY = y - size - 2;

  if (node.shape === "circle") {
    ctx.page.drawEllipse({
      x: x + size / 2,
      y: boxY + size / 2,
      xScale: size / 2,
      yScale: size / 2,
      borderColor: rgb(0.06, 0.24, 0.09),
      borderWidth: 1.5,
      color: isChecked ? rgb(0.06, 0.24, 0.09) : rgb(1, 1, 1),
    });
  } else {
    ctx.page.drawRectangle({
      x,
      y: boxY,
      width: size,
      height: size,
      borderColor: rgb(0.06, 0.24, 0.09),
      borderWidth: 1.5,
      color: isChecked ? rgb(0.06, 0.24, 0.09) : rgb(1, 1, 1),
    });
  }

  if (node.label) {
    ctx.page.drawText(node.label, {
      x: x + size + 6,
      y: boxY + 2,
      size: 9,
      font: ctx.fonts.bodyFont,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  return size + 6;
}

function renderSelectNode(
  ctx: PdfRenderContext,
  node: LayoutNode & { kind: "select" },
  x: number,
  y: number,
  availableWidth: number,
): number {
  const val = ctx.fieldValues[node.fieldBinding] ?? "";
  const displayVal = typeof val === "string" ? val : String(val ?? "");

  let curY = y;
  if (node.label) {
    ctx.page.drawText(node.label.toUpperCase(), {
      x,
      y: curY - 8,
      size: 8,
      font: ctx.fonts.titleFont,
      color: rgb(0.4, 0.45, 0.42),
    });
    curY -= 12;
  }

  const boxHeight = 18;
  const boxY = curY - boxHeight;

  ctx.page.drawRectangle({
    x,
    y: boxY,
    width: availableWidth,
    height: boxHeight,
    borderColor: rgb(0.8, 0.82, 0.8),
    borderWidth: 1,
    color: rgb(0.98, 0.99, 0.98),
  });

  if (displayVal) {
    ctx.page.drawText(displayVal, {
      x: x + 4,
      y: boxY + 4,
      size: 9,
      font: ctx.fonts.bodyFont,
      color: rgb(0.1, 0.1, 0.1),
    });
  }

  return (y - boxY) + 6;
}

function renderDividerNode(
  ctx: PdfRenderContext,
  node: LayoutNode & { kind: "divider" },
  x: number,
  y: number,
  availableWidth: number,
): number {
  const strokeW = node.strokeWidth ?? 1;
  const color = parseColorToken(node.strokeColor ?? "subtle", rgb(0.8, 0.82, 0.8))!;
  const curY = y - 4;

  ctx.page.drawLine({
    start: { x, y: curY },
    end: { x: x + availableWidth, y: curY },
    color,
    thickness: strokeW,
  });

  return strokeW + 8;
}

function renderSpacerNode(
  _ctx: PdfRenderContext,
  node: LayoutNode & { kind: "spacer" },
  _x: number,
  _y: number,
  _availableWidth: number,
): number {
  return node.size ?? 8;
}

function renderImageNode(
  ctx: PdfRenderContext,
  node: LayoutNode & { kind: "image" },
  x: number,
  y: number,
  availableWidth: number,
): number {
  const height = 80;
  const boxY = y - height;

  ctx.page.drawRectangle({
    x,
    y: boxY,
    width: availableWidth,
    height,
    borderColor: rgb(0.85, 0.87, 0.85),
    borderWidth: 1,
    color: rgb(0.96, 0.97, 0.96),
  });

  const label = node.alt || "Image / Avatar";
  ctx.page.drawText(label, {
    x: x + 8,
    y: boxY + height / 2 - 4,
    size: 9,
    font: ctx.fonts.bodyFont,
    color: rgb(0.5, 0.55, 0.5),
  });

  return height + 6;
}

function renderRepeaterNode(
  ctx: PdfRenderContext,
  node: LayoutNode & { kind: "repeater" },
  x: number,
  y: number,
  availableWidth: number,
): number {
  const repeaterKey = node.config?.key ?? "";
  const rows = ctx.repeaterRows[repeaterKey] ?? [];
  let curY = y;
  const initialY = y;

  if (node.name) {
    ctx.page.drawText(node.name, {
      x,
      y: curY - 12,
      size: 11,
      font: ctx.fonts.titleBoldFont,
      color: rgb(0.06, 0.24, 0.09),
    });
    curY -= 18;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const originalFieldValues = ctx.fieldValues;
    const rowFieldValues: Record<string, FieldValue> = { ...ctx.fieldValues };
    for (const [slotId, slotVal] of Object.entries(row.values ?? {})) {
      rowFieldValues[slotId] = slotVal as FieldValue;
    }
    ctx.fieldValues = rowFieldValues;

    if (curY < DEFAULT_MARGIN + 50) {
      ctx.addPage();
      curY = PAGE_HEIGHT - DEFAULT_MARGIN;
    }

    const rowHeight = renderNode(ctx, node.rowTemplate, x, curY, availableWidth);
    curY -= rowHeight + 4;
    ctx.fieldValues = originalFieldValues;
  }

  return Math.max(20, initialY - curY);
}

function renderComponentInstanceNode(
  ctx: PdfRenderContext,
  node: LayoutNode & { kind: "component-instance" },
  x: number,
  y: number,
  availableWidth: number,
): number {
  const version = ctx.resolvedComponents[node.componentVersionId];
  if (!version) {
    const boxHeight = 24;
    ctx.page.drawRectangle({
      x,
      y: y - boxHeight,
      width: availableWidth,
      height: boxHeight,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
      color: rgb(0.97, 0.97, 0.97),
    });
    ctx.page.drawText(node.name || "Component", {
      x: x + 6,
      y: y - boxHeight + 6,
      size: 9,
      font: ctx.fonts.bodyFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    return boxHeight + 4;
  }

  const originalFieldValues = ctx.fieldValues;
  if (node.propertyOverrides && Object.keys(node.propertyOverrides).length > 0) {
    ctx.fieldValues = {
      ...ctx.fieldValues,
      ...node.propertyOverrides,
    };
  }

  const componentRoot = version.layouts.print ?? version.layouts.desktop;
  const height = renderNode(ctx, componentRoot, x, y, availableWidth);
  ctx.fieldValues = originalFieldValues;
  return height;
}

function wrapText(font: PDFFont, text: string, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [text];
}
