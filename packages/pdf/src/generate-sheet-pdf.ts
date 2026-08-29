import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  RGB,
} from "pdf-lib";
import type {
  CharacterRepeaterRow,
  ComponentVersionDetails,
  CornerOrnaments,
  EdgeOrnament,
  FieldValue,
  LayoutNode,
} from "@mycharacter/contracts";
import {
  DND_CHEVRON_TITLE_ORNAMENT_GEOMETRY,
  DND_DIAMOND_TITLE_ORNAMENT_GEOMETRY,
  DND_TITLE_ORNAMENT_GEOMETRY,
  FATE_CORNER_TURNBACK_GEOMETRY,
  FATE_TITLE_ORNAMENT_GEOMETRY,
} from "@mycharacter/contracts";

export interface GenerateSheetPdfOptions {
  layout: LayoutNode;
  fieldValues?: Record<string, FieldValue>;
  repeaterRows?: Record<string, CharacterRepeaterRow[]>;
  resolvedComponents?: Record<string, ComponentVersionDetails>;
  title?: string;
  images?: Record<
    string,
    { bytes: Uint8Array; mediaType: "image/png" | "image/jpeg" }
  >;
}

// A4 Dimensions in points: 595.28 x 841.89
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const DESIGN_WIDTH = 595;
const DESIGN_HEIGHT = 874;
const DEFAULT_MARGIN = 18;

function parseColorToken(token?: string | null, fallback: RGB = rgb(0.13, 0.13, 0.13)): RGB | null {
  if (!token || token === "none" || token === "transparent") return null;
  if (token === "subtle") return rgb(0.55, 0.55, 0.55);
  if (token === "primary") return rgb(0.06, 0.24, 0.09);
  if (token === "accent") return rgb(0.25, 0.40, 0.44);
  if (token === "danger") return rgb(0.70, 0.28, 0.25);
  if (token === "gold") return rgb(0.72, 0.53, 0.04);
  if (token === "parchment") return rgb(0.98, 0.96, 0.93);
  if (token === "ink") return rgb(0, 0, 0);
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
  const pdfJsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(join(pdfJsRoot, "standard_fonts/LiberationSans-Regular.ttf")),
    readFile(join(pdfJsRoot, "standard_fonts/LiberationSans-Bold.ttf")),
  ]);

  doc.registerFontkit(fontkit);

  const [regularFont, boldFont] = await Promise.all([
    doc.embedFont(regularBytes, { subset: true }),
    doc.embedFont(boldBytes, { subset: true }),
  ]);

  return {
    titleFont: regularFont,
    titleBoldFont: boldFont,
    bodyFont: regularFont,
    bodyBoldFont: boldFont,
  };
}

class PdfRenderContext {
  public doc: PDFDocument;
  public page: PDFPage;
  public fonts: FontSet;
  public fieldValues: Record<string, FieldValue>;
  public repeaterRows: Record<string, CharacterRepeaterRow[]>;
  public resolvedComponents: Record<string, ComponentVersionDetails>;
  public images: Record<string, PDFImage>;
  public currentY: number;
  public pageHeight: number;

  constructor(
    doc: PDFDocument,
    page: PDFPage,
    fonts: FontSet,
    options: GenerateSheetPdfOptions,
    images: Record<string, PDFImage>,
    pageHeight: number,
  ) {
    this.doc = doc;
    this.page = page;
    this.fonts = fonts;
    this.fieldValues = options.fieldValues ?? {};
    this.repeaterRows = options.repeaterRows ?? {};
    this.resolvedComponents = options.resolvedComponents ?? {};
    this.images = images;
    this.pageHeight = pageHeight;
    this.currentY = pageHeight;
  }

  public addPage(): PDFPage {
    this.page = this.doc.addPage([DESIGN_WIDTH, this.pageHeight]);
    this.currentY = this.pageHeight;
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
  const images: Record<string, PDFImage> = {};
  for (const [fieldKey, image] of Object.entries(options.images ?? {})) {
    images[fieldKey] =
      image.mediaType === "image/png"
        ? await doc.embedPng(image.bytes)
        : await doc.embedJpg(image.bytes);
  }

  const measuringPage = doc.addPage([DESIGN_WIDTH, DESIGN_HEIGHT]);
  const measuringContext = new PdfRenderContext(
    doc,
    measuringPage,
    fonts,
    options,
    images,
    DESIGN_HEIGHT,
  );
  const contentHeight = Math.max(
    DESIGN_HEIGHT,
    estimateNodeHeight(measuringContext, options.layout, DESIGN_WIDTH),
  );
  doc.removePage(0);

  const sourceHeight = hasPopulatedRepeater(measuringContext, options.layout)
    ? DESIGN_HEIGHT
    : contentHeight;
  const sourcePage = doc.addPage([DESIGN_WIDTH, sourceHeight]);
  const ctx = new PdfRenderContext(
    doc,
    sourcePage,
    fonts,
    options,
    images,
    sourceHeight,
  );
  renderNode(ctx, options.layout, 0, sourceHeight, DESIGN_WIDTH);

  const sourceBytes = await doc.save();
  const output = await PDFDocument.create();
  if (options.title) output.setTitle(options.title);
  const sheets = await output.embedPdf(
    sourceBytes,
    Array.from({ length: doc.getPageCount() }, (_, index) => index),
  );
  for (const sheet of sheets) {
    const page = output.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const scale = Math.min(
      (PAGE_WIDTH - DEFAULT_MARGIN * 2) / sheet.width,
      (PAGE_HEIGHT - DEFAULT_MARGIN * 2) / sheet.height,
    );
    const width = sheet.width * scale;
    const height = sheet.height * scale;
    page.drawPage(sheet, {
      x: (PAGE_WIDTH - width) / 2,
      y: (PAGE_HEIGHT - height) / 2,
      width,
      height,
    });
  }
  return output.save();
}

function hasPopulatedRepeater(
  ctx: PdfRenderContext,
  node: LayoutNode,
): boolean {
  if (
    node.kind === "repeater" &&
    (ctx.repeaterRows[node.config.key]?.length ?? 0) > 0
  ) {
    return true;
  }
  if ("children" in node) {
    return node.children.some((child) => hasPopulatedRepeater(ctx, child));
  }
  if (node.kind === "component-instance") {
    const version = ctx.resolvedComponents[node.componentVersionId];
    const root = version?.layouts.print ?? version?.layouts.desktop;
    return root ? hasPopulatedRepeater(ctx, root) : false;
  }
  return false;
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
    case "table":
      return renderTableNode(ctx, node, x, y, availableWidth);
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
  let intrinsicHeight: number;
  switch (node.kind) {
    case "text": {
      const fontSize = node.fontSize ?? (node.variant === "title" ? 16 : node.variant === "display" ? 22 : node.variant === "caption" ? 9 : 11);
      const isTitle = node.variant === "title" || node.variant === "display" || node.fontFamily === "Montserrat Alternates";
      const font = isTitle ? ctx.fonts.titleFont : ctx.fonts.bodyFont;
      const lines = wrapText(font, node.text || " ", fontSize, availableWidth);
      intrinsicHeight = lines.length * fontSize * (node.lineHeight ?? 1.3) + 4;
      break;
    }
    case "field-input":
      intrinsicHeight = 36;
      break;
    case "number-input":
      intrinsicHeight = 42;
      break;
    case "textarea": {
      const savedHeight = ctx.fieldValues[`__layout_height__:${node.fieldBinding}`];
      const savedFontSize = ctx.fieldValues[`__layout_font_size__:${node.fieldBinding}`];
      const fontSize = typeof savedFontSize === "number" ? savedFontSize : 14;
      const value = ctx.fieldValues[node.fieldBinding];
      const text = typeof value === "string" ? value : "";
      const contentHeight = wrapText(ctx.fonts.bodyFont, text || " ", fontSize, availableWidth - 8).length * fontSize * 1.35 + 10;
      intrinsicHeight =
        Math.max(
          typeof savedHeight === "number" && savedHeight >= 48 ? savedHeight : 0,
          (node.rows ?? 3) * 16 + 8,
          contentHeight,
        ) + (node.label ? 18 : 0);
      break;
    }
    case "checkbox":
      intrinsicHeight = 20;
      break;
    case "select":
      intrinsicHeight = 36;
      break;
    case "divider":
      intrinsicHeight = (node.strokeWidth ?? 1) + 8;
      break;
    case "spacer":
      intrinsicHeight = node.size ?? 8;
      break;
    case "image":
      {
        const savedAspectRatio = ctx.fieldValues[`__image_aspect_ratio__:${node.fieldBinding}`];
        intrinsicHeight =
          typeof savedAspectRatio === "number" && savedAspectRatio > 0
            ? availableWidth / savedAspectRatio
            : 160;
      }
      break;
    case "table":
      intrinsicHeight = node.rows * 22 + 6;
      break;
    case "frame": {
      const pad = node.box.padding;
      const innerWidth = Math.max(10, availableWidth - pad.left - pad.right);
      const gapTotal = Math.max(0, node.children.length - 1) * node.gap;
      if (node.direction === "horizontal") {
        const childWidths = resolveChildWidths(node.children, innerWidth, node.gap);
        intrinsicHeight =
          pad.top +
          Math.max(
            0,
            ...node.children.map((child, index) =>
              estimateNodeHeight(ctx, child, childWidths[index] ?? innerWidth),
            ),
          ) +
          pad.bottom;
      } else {
        intrinsicHeight =
          pad.top +
          node.children.reduce(
            (height, child) =>
              height +
              estimateNodeHeight(
                ctx,
                child,
                resolveVerticalChildWidth(child, innerWidth),
              ),
            0,
          ) +
          gapTotal +
          pad.bottom;
      }
      break;
    }
    case "repeater": {
      const rows = ctx.repeaterRows[node.config.key] ?? [];
      intrinsicHeight =
        (node.name ? 18 : 0) +
        Math.max(
          20,
          rows.length *
            (estimateNodeHeight(ctx, node.rowTemplate, availableWidth) + 4),
        );
      break;
    }
    case "component-instance": {
      const version = ctx.resolvedComponents[node.componentVersionId];
      const root = version?.layouts.print ?? version?.layouts.desktop;
      intrinsicHeight = root
        ? estimateNodeHeight(ctx, root, availableWidth)
        : 28;
      break;
    }
    default:
      intrinsicHeight = 30;
  }

  const fixedHeight =
    node.box.height.mode === "fixed" ? node.box.height.value : 0;
  return Math.max(
    intrinsicHeight,
    fixedHeight,
    node.box.minHeight ?? 0,
  );
}

function resolveVerticalChildWidth(
  node: LayoutNode,
  availableWidth: number,
): number {
  const preferred =
    node.box.width.mode === "fixed" ? node.box.width.value : availableWidth;
  return Math.max(
    node.box.minWidth ?? 1,
    Math.min(node.box.maxWidth ?? availableWidth, preferred, availableWidth),
  );
}

function resolveChildWidths(
  children: LayoutNode[],
  availableWidth: number,
  gap: number,
): number[] {
  if (children.length === 0) return [];
  const contentWidth = Math.max(
    1,
    availableWidth - Math.max(0, children.length - 1) * gap,
  );
  const fixedWidth = children.reduce(
    (total, child) =>
      total +
      (child.box.width.mode === "fixed"
        ? Math.min(child.box.width.value, contentWidth)
        : 0),
    0,
  );
  const flexibleCount = children.filter(
    (child) => child.box.width.mode !== "fixed",
  ).length;
  const flexibleWidth = Math.max(
    1,
    (contentWidth - fixedWidth) / Math.max(1, flexibleCount),
  );
  return children.map((child) => {
    const preferred =
      child.box.width.mode === "fixed"
        ? child.box.width.value
        : flexibleWidth;
    return Math.max(
      child.box.minWidth ?? 1,
      Math.min(child.box.maxWidth ?? contentWidth, preferred, contentWidth),
    );
  });
}

function drawCornerTurnbacksPdf(
  ctx: PdfRenderContext,
  x: number,
  y: number,
  width: number,
  height: number,
  corners: CornerOrnaments,
  color: RGB,
  maskColor: RGB,
) {
  if (
    corners.preset !== "fate-turnback" &&
    corners.preset !== "arc-corner"
  ) {
    return;
  }
  const size = FATE_CORNER_TURNBACK_GEOMETRY.width;
  const outerWidth = FATE_CORNER_TURNBACK_GEOMETRY.outerArcStrokeWidth;
  const innerWidth = FATE_CORNER_TURNBACK_GEOMETRY.innerArcStrokeWidth;

  // Top-Left Corner
  if (corners.topLeft) {
    ctx.page.drawRectangle({ x, y: y - size, width: size, height: size, color: maskColor });
    ctx.page.drawSvgPath(FATE_CORNER_TURNBACK_GEOMETRY.outerArcPath, {
      x,
      y,
      borderColor: color,
      borderWidth: outerWidth,
    });
    ctx.page.drawSvgPath(FATE_CORNER_TURNBACK_GEOMETRY.innerArcPath, {
      x,
      y,
      borderColor: color,
      borderWidth: innerWidth,
    });
    ctx.page.drawSvgPath(FATE_CORNER_TURNBACK_GEOMETRY.diagonalPath, {
      x,
      y,
      borderColor: color,
      borderWidth: FATE_CORNER_TURNBACK_GEOMETRY.diagonalStrokeWidth,
    });
  }

  // Top-Right Corner
  if (corners.topRight) {
    const cornerX = x + width - size;
    ctx.page.drawRectangle({ x: cornerX, y: y - size, width: size, height: size, color: maskColor });
    ctx.page.drawSvgPath("M0 0.25A9.75 9.75 0 0 1 9.75 10", {
      x: cornerX,
      y,
      borderColor: color,
      borderWidth: outerWidth,
    });
    ctx.page.drawSvgPath("M0 2.5A7.5 7.5 0 0 1 7.5 10", {
      x: cornerX,
      y,
      borderColor: color,
      borderWidth: innerWidth,
    });
    ctx.page.drawSvgPath("M7 3L5 5", {
      x: cornerX,
      y,
      borderColor: color,
      borderWidth: FATE_CORNER_TURNBACK_GEOMETRY.diagonalStrokeWidth,
    });
  }

  // Bottom-Left Corner
  if (corners.bottomLeft) {
    const cornerTop = y - height + size;
    ctx.page.drawRectangle({ x, y: y - height, width: size, height: size, color: maskColor });
    ctx.page.drawSvgPath("M2.5 0A7.5 7.5 0 0 0 10 7.5", {
      x,
      y: cornerTop,
      borderColor: color,
      borderWidth: innerWidth,
    });
    ctx.page.drawSvgPath("M0.25 0A9.75 9.75 0 0 0 10 9.75", {
      x,
      y: cornerTop,
      borderColor: color,
      borderWidth: outerWidth,
    });
    ctx.page.drawSvgPath("M3 7L5 5", {
      x,
      y: cornerTop,
      borderColor: color,
      borderWidth: FATE_CORNER_TURNBACK_GEOMETRY.diagonalStrokeWidth,
    });
  }

  // Bottom-Right Corner
  if (corners.bottomRight) {
    const cornerX = x + width - size;
    const cornerTop = y - height + size;
    ctx.page.drawRectangle({ x: cornerX, y: y - height, width: size, height: size, color: maskColor });
    ctx.page.drawSvgPath("M7.5 0A7.5 7.5 0 0 1 0 7.5", {
      x: cornerX,
      y: cornerTop,
      borderColor: color,
      borderWidth: innerWidth,
    });
    ctx.page.drawSvgPath("M9.75 0A9.75 9.75 0 0 1 0 9.75", {
      x: cornerX,
      y: cornerTop,
      borderColor: color,
      borderWidth: outerWidth,
    });
    ctx.page.drawSvgPath("M7 7L5 5", {
      x: cornerX,
      y: cornerTop,
      borderColor: color,
      borderWidth: FATE_CORNER_TURNBACK_GEOMETRY.diagonalStrokeWidth,
    });
  }
}

type PdfEdgeGeometry = {
  height: number;
  capWidth: number;
  leftOuterPath: string;
  leftInnerPath: string;
  rightOuterPath: string;
  rightInnerPath: string;
  outerStrokeWidth: number;
  innerStrokeWidth: number;
  innerTopLineY: number;
  innerBottomLineY: number;
};

function drawEdgeOrnamentPdf(
  ctx: PdfRenderContext,
  x: number,
  startY: number,
  frameWidth: number,
  frameHeight: number,
  ornament: EdgeOrnament,
  dock: "top" | "bottom",
  color: RGB,
  maskColor: RGB,
) {
  if (ornament.preset === "none" || !ornament.text.trim()) return;
  if (ornament.preset === "legacy-pill") {
    drawLegacyEdgeOrnamentPdf(
      ctx,
      x,
      startY,
      frameWidth,
      frameHeight,
      ornament,
      dock,
      color,
    );
    return;
  }

  const geometry: PdfEdgeGeometry =
    ornament.preset === "fate"
      ? FATE_TITLE_ORNAMENT_GEOMETRY
      : ornament.preset === "dnd-diamond"
        ? DND_DIAMOND_TITLE_ORNAMENT_GEOMETRY
        : DND_CHEVRON_TITLE_ORNAMENT_GEOMETRY;
  const font =
    ornament.fontFamily === "Montserrat Alternates"
      ? ornament.fontWeight === "bold" || ornament.fontWeight === "700"
        ? ctx.fonts.titleBoldFont
        : ctx.fonts.titleFont
      : ornament.fontWeight === "bold" || ornament.fontWeight === "700"
        ? ctx.fonts.bodyBoldFont
        : ctx.fonts.bodyFont;
  const fontSize = ornament.fontSize;
  const text = ornament.text;
  const rawTextWidth = font.widthOfTextAtSize(text, fontSize);
  const textWidth = Math.max(
    10,
    rawTextWidth + Math.max(0, text.length - 1) * ornament.letterSpacingPx,
  );
  const centerWidth = textWidth + 16;
  const totalWidth = geometry.capWidth * 2 + centerWidth;
  let badgeX = x + (frameWidth - totalWidth) / 2 + ornament.offset;
  if (ornament.align === "start") badgeX = x + 5 + ornament.offset;
  if (ornament.align === "end") {
    badgeX = x + frameWidth - totalWidth - 5 + ornament.offset;
  }
  const badgeBottom =
    dock === "top"
      ? startY - geometry.height / 2
      : startY - frameHeight - geometry.height / 2;
  const badgeTop = badgeBottom + geometry.height;
  const centerX = badgeX + geometry.capWidth;

  ctx.page.drawSvgPath(geometry.leftOuterPath, {
    x: badgeX,
    y: badgeTop,
    color: maskColor,
    borderColor: color,
    borderWidth: geometry.outerStrokeWidth,
  });
  ctx.page.drawSvgPath(geometry.leftInnerPath, {
    x: badgeX,
    y: badgeTop,
    borderColor: color,
    borderWidth: geometry.innerStrokeWidth,
  });
  ctx.page.drawRectangle({
    x: centerX,
    y: badgeBottom,
    width: centerWidth,
    height: geometry.height,
    color: maskColor,
  });
  for (const lineY of [
    0,
    geometry.innerTopLineY,
    geometry.innerBottomLineY,
    geometry.height,
  ]) {
    const inner =
      lineY === geometry.innerTopLineY ||
      lineY === geometry.innerBottomLineY;
    ctx.page.drawLine({
      start: { x: centerX, y: badgeTop - lineY },
      end: { x: centerX + centerWidth, y: badgeTop - lineY },
      thickness: inner
        ? geometry.innerStrokeWidth
        : geometry.outerStrokeWidth,
      color,
    });
  }
  const rightX = centerX + centerWidth;
  ctx.page.drawSvgPath(geometry.rightOuterPath, {
    x: rightX,
    y: badgeTop,
    color: maskColor,
    borderColor: color,
    borderWidth: geometry.outerStrokeWidth,
  });
  ctx.page.drawSvgPath(geometry.rightInnerPath, {
    x: rightX,
    y: badgeTop,
    borderColor: color,
    borderWidth: geometry.innerStrokeWidth,
  });
  ctx.page.drawText(text, {
    x: centerX + (centerWidth - textWidth) / 2,
    y: badgeBottom + (geometry.height - fontSize) / 2 + 1.5,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawLegacyEdgeOrnamentPdf(
  ctx: PdfRenderContext,
  x: number,
  startY: number,
  frameWidth: number,
  frameHeight: number,
  ornament: EdgeOrnament,
  dock: "top" | "bottom",
  color: RGB,
) {
  if (ornament.preset === "none" || !ornament.text.trim()) return;

  const font =
    ornament.fontFamily === "Montserrat Alternates"
      ? ornament.fontWeight === "bold"
        ? ctx.fonts.titleBoldFont
        : ctx.fonts.titleFont
      : ornament.fontWeight === "bold"
      ? ctx.fonts.bodyBoldFont
      : ctx.fonts.bodyFont;

  const fontSize = ornament.fontSize ?? 10;
  const text = ornament.text;
  const rawTextWidth = font.widthOfTextAtSize(text, fontSize);
  const letterSpacing = ornament.letterSpacingPx ?? -0.9;
  const textWidth = Math.max(10, rawTextWidth + (text.length - 1) * letterSpacing);

  const white = rgb(1, 1, 1);
  const ornHeight = ornament.preset === "dnd" ? DND_TITLE_ORNAMENT_GEOMETRY.height : FATE_TITLE_ORNAMENT_GEOMETRY.height;
  const capWidth = ornament.preset === "dnd" ? DND_TITLE_ORNAMENT_GEOMETRY.capWidth : FATE_TITLE_ORNAMENT_GEOMETRY.capWidth;
  const totalWidth = Math.min(frameWidth - 8, textWidth + capWidth * 2 + 12);

  let badgeX = x + (frameWidth - totalWidth) / 2 + (ornament.offset || 0);
  if (ornament.align === "start") {
    badgeX = x + 12 + (ornament.offset || 0);
  } else if (ornament.align === "end") {
    badgeX = x + frameWidth - totalWidth - 12 + (ornament.offset || 0);
  }

  const badgeY =
    dock === "top"
      ? startY - ornHeight / 2
      : startY - frameHeight - ornHeight / 2;

  // Clear background underneath ornament
  ctx.page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: totalWidth,
    height: ornHeight,
    color: white,
  });

  if (ornament.preset === "fate") {
    // Top line (0.5)
    ctx.page.drawLine({
      start: { x: badgeX + capWidth, y: badgeY + ornHeight },
      end: { x: badgeX + totalWidth - capWidth, y: badgeY + ornHeight },
      thickness: FATE_TITLE_ORNAMENT_GEOMETRY.topLineStrokeWidth,
      color,
    });
    // Bottom line (1.5)
    ctx.page.drawLine({
      start: { x: badgeX + capWidth, y: badgeY },
      end: { x: badgeX + totalWidth - capWidth, y: badgeY },
      thickness: FATE_TITLE_ORNAMENT_GEOMETRY.bottomLineStrokeWidth,
      color,
    });

    // Left bracket cap
    ctx.page.drawLine({
      start: { x: badgeX + capWidth, y: badgeY + ornHeight },
      end: { x: badgeX + 4, y: badgeY + ornHeight },
      thickness: 1,
      color,
    });
    ctx.page.drawLine({
      start: { x: badgeX + 4, y: badgeY + ornHeight },
      end: { x: badgeX + 1, y: badgeY + ornHeight / 2 },
      thickness: 1,
      color,
    });
    ctx.page.drawLine({
      start: { x: badgeX + 1, y: badgeY + ornHeight / 2 },
      end: { x: badgeX + 4, y: badgeY },
      thickness: 1,
      color,
    });
    ctx.page.drawLine({
      start: { x: badgeX + 4, y: badgeY },
      end: { x: badgeX + capWidth, y: badgeY },
      thickness: 1,
      color,
    });

    // Right mirrored bracket cap
    const rx = badgeX + totalWidth;
    ctx.page.drawLine({
      start: { x: rx - capWidth, y: badgeY + ornHeight },
      end: { x: rx - 4, y: badgeY + ornHeight },
      thickness: 1,
      color,
    });
    ctx.page.drawLine({
      start: { x: rx - 4, y: badgeY + ornHeight },
      end: { x: rx - 1, y: badgeY + ornHeight / 2 },
      thickness: 1,
      color,
    });
    ctx.page.drawLine({
      start: { x: rx - 1, y: badgeY + ornHeight / 2 },
      end: { x: rx - 4, y: badgeY },
      thickness: 1,
      color,
    });
    ctx.page.drawLine({
      start: { x: rx - 4, y: badgeY },
      end: { x: rx - capWidth, y: badgeY },
      thickness: 1,
      color,
    });
  } else if (ornament.preset === "dnd") {
    // Top double lines
    ctx.page.drawLine({
      start: { x: badgeX + capWidth, y: badgeY + ornHeight - 1.5 },
      end: { x: badgeX + totalWidth - capWidth, y: badgeY + ornHeight - 1.5 },
      thickness: DND_TITLE_ORNAMENT_GEOMETRY.topOuterStrokeWidth,
      color,
    });
    ctx.page.drawLine({
      start: { x: badgeX + capWidth, y: badgeY + ornHeight - 4 },
      end: { x: badgeX + totalWidth - capWidth, y: badgeY + ornHeight - 4 },
      thickness: DND_TITLE_ORNAMENT_GEOMETRY.topInnerStrokeWidth,
      color,
    });

    // Bottom double lines
    ctx.page.drawLine({
      start: { x: badgeX + capWidth, y: badgeY + 4 },
      end: { x: badgeX + totalWidth - capWidth, y: badgeY + 4 },
      thickness: DND_TITLE_ORNAMENT_GEOMETRY.bottomInnerStrokeWidth,
      color,
    });
    ctx.page.drawLine({
      start: { x: badgeX + capWidth, y: badgeY + 1.5 },
      end: { x: badgeX + totalWidth - capWidth, y: badgeY + 1.5 },
      thickness: DND_TITLE_ORNAMENT_GEOMETRY.bottomOuterStrokeWidth,
      color,
    });

    // Outer faceted caps
    ctx.page.drawLine({
      start: { x: badgeX + capWidth, y: badgeY + ornHeight - 1.5 },
      end: { x: badgeX + 7, y: badgeY + ornHeight - 1.5 },
      thickness: 1,
      color,
    });
    ctx.page.drawLine({
      start: { x: badgeX + 7, y: badgeY + ornHeight - 1.5 },
      end: { x: badgeX + 1.5, y: badgeY + ornHeight / 2 },
      thickness: 1,
      color,
    });
    ctx.page.drawLine({
      start: { x: badgeX + 1.5, y: badgeY + ornHeight / 2 },
      end: { x: badgeX + 7, y: badgeY + 1.5 },
      thickness: 1,
      color,
    });
    ctx.page.drawLine({
      start: { x: badgeX + 7, y: badgeY + 1.5 },
      end: { x: badgeX + capWidth, y: badgeY + 1.5 },
      thickness: 1,
      color,
    });

    const rx = badgeX + totalWidth;
    ctx.page.drawLine({
      start: { x: rx - capWidth, y: badgeY + ornHeight - 1.5 },
      end: { x: rx - 7, y: badgeY + ornHeight - 1.5 },
      thickness: 1,
      color,
    });
    ctx.page.drawLine({
      start: { x: rx - 7, y: badgeY + ornHeight - 1.5 },
      end: { x: rx - 1.5, y: badgeY + ornHeight / 2 },
      thickness: 1,
      color,
    });
    ctx.page.drawLine({
      start: { x: rx - 1.5, y: badgeY + ornHeight / 2 },
      end: { x: rx - 7, y: badgeY + 1.5 },
      thickness: 1,
      color,
    });
    ctx.page.drawLine({
      start: { x: rx - 7, y: badgeY + 1.5 },
      end: { x: rx - capWidth, y: badgeY + 1.5 },
      thickness: 1,
      color,
    });
  } else {
    // Legacy pill border
    ctx.page.drawRectangle({
      x: badgeX,
      y: badgeY,
      width: totalWidth,
      height: ornHeight,
      borderColor: color,
      borderWidth: 1,
      color: white,
    });
  }

  // Draw Text centered horizontally and vertically
  const textX = badgeX + capWidth + (totalWidth - capWidth * 2 - textWidth) / 2;
  const textY = badgeY + (ornHeight - fontSize) / 2 + 2;

  ctx.page.drawText(text, {
    x: textX,
    y: textY,
    size: fontSize,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
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

  const measuredHeight = estimateNodeHeight(ctx, node, availableWidth);

  // Background fill and border stroke drawn underneath
  const fillColor = parseColorToken(node.box?.fill ?? "transparent");
  const strokeColor = parseColorToken(node.box?.strokeColor ?? "none");
  const ornamentMaskColor = fillColor ?? rgb(1, 1, 1);
  const strokeTop = node.box?.strokeWidth?.top ?? (strokeColor ? 1 : 0);

  if (fillColor) {
    ctx.page.drawRectangle({
      x,
      y: startY - measuredHeight,
      width: availableWidth,
      height: measuredHeight,
      color: fillColor,
    });
  }

  if (strokeColor && strokeTop > 0) {
    ctx.page.drawRectangle({
      x,
      y: startY - measuredHeight,
      width: availableWidth,
      height: measuredHeight,
      borderColor: strokeColor,
      borderWidth: strokeTop,
    });
  }

  // Render children
  if (node.direction === "horizontal" && node.children.length > 0) {
    const childWidths = resolveChildWidths(node.children, innerWidth, gap);
    let maxChildHeight = 0;

    let childX = x + pad.left;
    for (let index = 0; index < node.children.length; index += 1) {
      const child = node.children[index]!;
      const childWidth = childWidths[index] ?? innerWidth;
      const childHeight = renderNode(ctx, child, childX, contentY, childWidth);
      if (childHeight > maxChildHeight) maxChildHeight = childHeight;
      childX += childWidth + gap;
    }
    contentY -= maxChildHeight;
  } else {
    for (const child of node.children) {
      const childHeight = renderNode(
        ctx,
        child,
        x + pad.left,
        contentY,
        resolveVerticalChildWidth(child, innerWidth),
      );
      contentY -= childHeight + gap;
    }
    if (node.children.length > 0) {
      contentY += gap;
    }
  }

  const finalHeight = Math.max(startY - contentY + pad.bottom, measuredHeight);

  // Draw Corner Ornaments (Fate turnbacks)
  const defaultCorners: CornerOrnaments = {
    preset: node.ornamentStyle === "arc-corner" ? "arc-corner" : "none",
    topLeft: true,
    topRight: true,
    bottomRight: true,
    bottomLeft: true,
  };
  const activeCorners = node.cornerOrnaments ?? defaultCorners;
  if (strokeColor && activeCorners.preset === "fate-turnback") {
    drawCornerTurnbacksPdf(ctx, x, startY, availableWidth, finalHeight, activeCorners, strokeColor, ornamentMaskColor);
  }

  // Draw Top Edge Ornament
  const defaultTop: EdgeOrnament = {
    preset: node.titleDock && node.titleDock.dock === "top" && node.titleDock.variant !== "none" ? "legacy-pill" : "none",
    align: node.titleDock?.variant?.includes("center") ? "center" : "start",
    offset: 0,
    text: node.titleDock?.text || "",
    fontFamily: "Montserrat Alternates",
    fontSize: 10,
    fontWeight: "medium",
    letterSpacingPx: -0.9,
  };
  const activeTop = node.topOrnament ?? defaultTop;
  if (strokeColor && activeTop.preset !== "none") {
    drawEdgeOrnamentPdf(ctx, x, startY, availableWidth, finalHeight, activeTop, "top", strokeColor, ornamentMaskColor);
  }

  // Draw Bottom Edge Ornament
  const defaultBottom: EdgeOrnament = {
    preset: node.footerDock && node.footerDock.dock === "bottom" && node.footerDock.variant !== "none" ? "legacy-pill" : "none",
    align: node.footerDock?.variant?.includes("center") ? "center" : "start",
    offset: 0,
    text: node.footerDock?.text || "",
    fontFamily: "Montserrat Alternates",
    fontSize: 10,
    fontWeight: "medium",
    letterSpacingPx: -0.9,
  };
  const activeBottom = node.bottomOrnament ?? defaultBottom;
  if (strokeColor && activeBottom.preset !== "none") {
    drawEdgeOrnamentPdf(ctx, x, startY, availableWidth, finalHeight, activeBottom, "bottom", strokeColor, ornamentMaskColor);
  }

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
  const savedFontSize = ctx.fieldValues[`__layout_font_size__:${node.fieldBinding}`];
  const fontSize = typeof savedFontSize === "number" ? savedFontSize : 14;
  const totalHeight = estimateNodeHeight(ctx, node, availableWidth);
  const labelHeight = node.label ? 12 : 0;
  const boxHeight = Math.max(rows * 16 + 8, totalHeight - labelHeight - 6);

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
    const lines = wrapText(font, displayVal, fontSize, availableWidth - 8);
    let lineY = boxY + boxHeight - fontSize - 3;
    for (let i = 0; i < lines.length; i++) {
      ctx.page.drawText(lines[i]!, {
        x: x + 4,
        y: lineY,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      lineY -= fontSize * 1.35;
    }
  } else if (node.placeholder) {
    ctx.page.drawText(node.placeholder, {
      x: x + 4,
      y: boxY + boxHeight - 12,
      size: fontSize,
      font,
      color: rgb(0.65, 0.65, 0.65),
    });
  }

  return totalHeight;
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
      borderWidth: node.showBorder === false ? 0 : 1.5,
      color: isChecked ? rgb(0.06, 0.24, 0.09) : rgb(1, 1, 1),
    });
  } else {
    ctx.page.drawRectangle({
      x,
      y: boxY,
      width: size,
      height: size,
      borderColor: rgb(0.06, 0.24, 0.09),
      borderWidth: node.showBorder === false ? 0 : 1.5,
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
  const height = estimateNodeHeight(ctx, node, availableWidth);
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

  const image = ctx.images[node.fieldBinding];
  if (image) {
    if (node.fit === "fill") {
      ctx.page.drawImage(image, { x, y: boxY, width: availableWidth, height });
    } else {
      const scale = Math.min(availableWidth / image.width, height / image.height);
      const width = image.width * scale;
      const imageHeight = image.height * scale;
      ctx.page.drawImage(image, {
        x: x + (availableWidth - width) / 2,
        y: boxY + (height - imageHeight) / 2,
        width,
        height: imageHeight,
      });
    }
  } else {
    const label = node.alt || "Character portrait";
    ctx.page.drawText(label, {
      x: x + 8,
      y: boxY + height / 2 - 4,
      size: 9,
      font: ctx.fonts.bodyFont,
      color: rgb(0.5, 0.55, 0.5),
    });
  }

  return height;
}

function renderTableNode(
  ctx: PdfRenderContext,
  node: LayoutNode & { kind: "table" },
  x: number,
  y: number,
  availableWidth: number,
): number {
  const rowHeight = 22;
  const tableHeight = node.rows * rowHeight;
  const columnWidth = availableWidth / node.columns;
  const bottom = y - tableHeight;
  const lineColor = rgb(0.55, 0.57, 0.55);

  ctx.page.drawRectangle({
    x,
    y: bottom,
    width: availableWidth,
    height: tableHeight,
    borderColor: lineColor,
    borderWidth: 1,
  });

  for (let row = 0; row < node.rows; row += 1) {
    if (row > 0) {
      const lineY = y - row * rowHeight;
      ctx.page.drawLine({
        start: { x, y: lineY },
        end: { x: x + availableWidth, y: lineY },
        color: lineColor,
        thickness: 0.75,
      });
    }
    for (let column = 0; column < node.columns; column += 1) {
      if (row === 0 && column > 0) {
        const lineX = x + column * columnWidth;
        ctx.page.drawLine({
          start: { x: lineX, y },
          end: { x: lineX, y: bottom },
          color: lineColor,
          thickness: 0.75,
        });
      }
      const isHeader = row < node.headerRows || column < node.headerColumns;
      const label = node.cellLabels[row * node.columns + column] ?? "";
      const fieldKey = `${node.fieldBindingPrefix}_${row}_${column}`;
      const rawValue = ctx.fieldValues[fieldKey];
      const text = isHeader ? label : typeof rawValue === "string" ? rawValue : "";
      if (!text) continue;
      ctx.page.drawText(text.slice(0, 60), {
        x: x + column * columnWidth + 4,
        y: y - row * rowHeight - 14,
        size: 8,
        font: isHeader ? ctx.fonts.bodyBoldFont : ctx.fonts.bodyFont,
        color: rgb(0.1, 0.1, 0.1),
        maxWidth: Math.max(1, columnWidth - 8),
      });
    }
  }

  return tableHeight + 6;
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

    const estimatedRowHeight = estimateNodeHeight(
      ctx,
      node.rowTemplate,
      availableWidth,
    );
    if (curY - estimatedRowHeight < 0) {
      ctx.addPage();
      curY = ctx.pageHeight;
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
