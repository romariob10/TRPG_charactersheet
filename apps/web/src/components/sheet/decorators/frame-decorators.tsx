"use client";

import React from "react";
import type {
  CornerOrnaments,
  EdgeOrnament,
  OrnamentStyle,
  StrokeToken,
  TitleDock,
} from "@mycharacter/contracts";
import {
  DND_TITLE_ORNAMENT_GEOMETRY,
  FATE_CORNER_TURNBACK_GEOMETRY,
  FATE_TITLE_ORNAMENT_GEOMETRY,
} from "@mycharacter/contracts";

interface FrameDecoratorProps {
  strokeColor: StrokeToken;
  strokeWidth: { top: number; right: number; bottom: number; left: number };
  cornerRadius: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
  cornerOrnaments?: CornerOrnaments;
  topOrnament?: EdgeOrnament;
  bottomOrnament?: EdgeOrnament;
  // Legacy support props
  ornamentStyle?: OrnamentStyle;
  titleDock?: TitleDock;
  footerDock?: TitleDock;
  children: React.ReactNode;
  className?: string;
}

const STROKE_COLORS: Record<StrokeToken, string> = {
  default: "var(--border, #d1d5db)",
  subtle: "var(--border-subtle, #e5e7eb)",
  accent: "var(--accent, #6366f1)",
  primary: "var(--primary, #3b82f6)",
  danger: "var(--destructive, #ef4444)",
  none: "transparent",
  gold: "#d97706",
  parchment: "#92400e",
};

/**
 * Fate Corner Turnback SVG component.
 * Exact 10x10 geometry from Figma node 17:613 with mask and concentric arcs.
 */
const FateCornerTurnback: React.FC<{
  corner: "topLeft" | "topRight" | "bottomRight" | "bottomLeft";
  color: string;
}> = ({ corner, color }) => {
  const rotation = FATE_CORNER_TURNBACK_GEOMETRY.rotations[corner];
  const offset = FATE_CORNER_TURNBACK_GEOMETRY.offsetPx;

  // Positioning classes and style depending on corner
  const positionStyle: React.CSSProperties = {
    position: "absolute",
    width: `${FATE_CORNER_TURNBACK_GEOMETRY.width}px`,
    height: `${FATE_CORNER_TURNBACK_GEOMETRY.height}px`,
    pointerEvents: "none",
    zIndex: 10,
  };

  if (corner === "topLeft") {
    positionStyle.top = `${offset}px`;
    positionStyle.left = `${offset}px`;
  } else if (corner === "topRight") {
    positionStyle.top = `${offset}px`;
    positionStyle.right = `${offset}px`;
  } else if (corner === "bottomRight") {
    positionStyle.bottom = `${offset}px`;
    positionStyle.right = `${offset}px`;
  } else if (corner === "bottomLeft") {
    positionStyle.bottom = `${offset}px`;
    positionStyle.left = `${offset}px`;
  }

  return (
    <svg
      style={positionStyle}
      viewBox={FATE_CORNER_TURNBACK_GEOMETRY.viewBox}
      width={FATE_CORNER_TURNBACK_GEOMETRY.width}
      height={FATE_CORNER_TURNBACK_GEOMETRY.height}
      aria-hidden="true"
    >
      <g transform={`rotate(${rotation} 5 5)`}>
        {/* White corner blocker mask to cover underlying straight border corner */}
        <path
          d={FATE_CORNER_TURNBACK_GEOMETRY.maskPath}
          fill="var(--background, #ffffff)"
        />
        {/* Inner concentric arc */}
        <path
          d={FATE_CORNER_TURNBACK_GEOMETRY.innerArcPath}
          stroke={color}
          strokeWidth={FATE_CORNER_TURNBACK_GEOMETRY.innerArcStrokeWidth}
          fill="none"
        />
        {/* Outer concentric arc */}
        <path
          d={FATE_CORNER_TURNBACK_GEOMETRY.outerArcPath}
          stroke={color}
          strokeWidth={FATE_CORNER_TURNBACK_GEOMETRY.outerArcStrokeWidth}
          fill="none"
        />
      </g>
    </svg>
  );
};

/**
 * Renders an edge title/footer ornament (Fate, D&D, or legacy pill).
 */
const RenderEdgeOrnament: React.FC<{
  ornament: EdgeOrnament;
  dock: "top" | "bottom";
  color: string;
}> = ({ ornament, dock, color }) => {
  if (ornament.preset === "none" || !ornament.text.trim()) {
    return null;
  }

  const { preset, align, offset, text, fontFamily, fontSize, fontWeight, letterSpacingPx } = ornament;

  // Alignment positioning style
  const containerStyle: React.CSSProperties = {
    position: "absolute",
    zIndex: 15,
    display: "flex",
    alignItems: "center",
    whiteSpace: "nowrap",
    userSelect: "none",
  };

  if (dock === "top") {
    containerStyle.top = `${-(fontSize > 12 ? 14 : 10)}px`;
  } else {
    containerStyle.bottom = `${-(fontSize > 12 ? 14 : 10)}px`;
  }

  if (align === "center") {
    containerStyle.left = `calc(50% + ${offset}px)`;
    containerStyle.transform = "translateX(-50%)";
  } else if (align === "start") {
    containerStyle.left = `calc(12px + ${offset}px)`;
  } else if (align === "end") {
    containerStyle.right = `calc(12px + ${offset}px)`;
  }

  const typographyStyle: React.CSSProperties = {
    fontFamily:
      fontFamily === "Montserrat Alternates"
        ? 'var(--font-montserrat-alternates, "Montserrat Alternates"), sans-serif'
        : fontFamily === "Noto Sans"
        ? 'var(--font-noto-sans, "Noto Sans"), sans-serif'
        : "inherit",
    fontSize: `${fontSize}px`,
    fontWeight: fontWeight === "bold" ? 700 : fontWeight === "medium" ? 500 : 400,
    letterSpacing: `${letterSpacingPx}px`,
    textTransform: "uppercase",
    lineHeight: 1,
  };

  if (preset === "fate") {
    return (
      <div style={containerStyle} className="items-stretch select-none">
        {/* Left Fate End Cap */}
        <svg
          width={FATE_TITLE_ORNAMENT_GEOMETRY.capWidth}
          height={FATE_TITLE_ORNAMENT_GEOMETRY.height}
          viewBox="0 0 14 20"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <path
            d={FATE_TITLE_ORNAMENT_GEOMETRY.leftCapMaskPath}
            fill="var(--background, #ffffff)"
          />
          <path
            d={FATE_TITLE_ORNAMENT_GEOMETRY.leftCapPath}
            stroke={color}
            strokeWidth={1}
            fill="none"
          />
        </svg>

        {/* Center Text Container with Dual Horizontal Lines */}
        <div
          className="relative flex items-center justify-center px-2 bg-background"
          style={{ height: `${FATE_TITLE_ORNAMENT_GEOMETRY.height}px` }}
        >
          {/* Top Line */}
          <div
            className="absolute top-0 left-0 right-0"
            style={{
              height: `${FATE_TITLE_ORNAMENT_GEOMETRY.topLineStrokeWidth}px`,
              backgroundColor: color,
            }}
          />
          {/* Text */}
          <span style={typographyStyle} className="text-foreground select-none">
            {text}
          </span>
          {/* Bottom Line */}
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{
              height: `${FATE_TITLE_ORNAMENT_GEOMETRY.bottomLineStrokeWidth}px`,
              backgroundColor: color,
            }}
          />
        </div>

        {/* Right Mirrored Fate End Cap */}
        <svg
          width={FATE_TITLE_ORNAMENT_GEOMETRY.capWidth}
          height={FATE_TITLE_ORNAMENT_GEOMETRY.height}
          viewBox="0 0 14 20"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <g transform="scale(-1, 1) translate(-14, 0)">
            <path
              d={FATE_TITLE_ORNAMENT_GEOMETRY.leftCapMaskPath}
              fill="var(--background, #ffffff)"
            />
            <path
              d={FATE_TITLE_ORNAMENT_GEOMETRY.leftCapPath}
              stroke={color}
              strokeWidth={1}
              fill="none"
            />
          </g>
        </svg>
      </div>
    );
  }

  if (preset === "dnd") {
    return (
      <div style={containerStyle} className="items-stretch select-none">
        {/* Left D&D Pointed Facet Cap */}
        <svg
          width={DND_TITLE_ORNAMENT_GEOMETRY.capWidth}
          height={DND_TITLE_ORNAMENT_GEOMETRY.height}
          viewBox="0 0 18 22"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <path
            d={DND_TITLE_ORNAMENT_GEOMETRY.capMaskPath}
            fill="var(--background, #ffffff)"
          />
          <path
            d={DND_TITLE_ORNAMENT_GEOMETRY.outerCapPath}
            stroke={color}
            strokeWidth={DND_TITLE_ORNAMENT_GEOMETRY.topOuterStrokeWidth}
            fill="none"
          />
          <path
            d={DND_TITLE_ORNAMENT_GEOMETRY.innerCapPath}
            stroke={color}
            strokeWidth={DND_TITLE_ORNAMENT_GEOMETRY.topInnerStrokeWidth}
            fill="none"
          />
          <path
            d={DND_TITLE_ORNAMENT_GEOMETRY.diamondMarkerPath}
            fill={color}
          />
        </svg>

        {/* Center Text Container with Double Border Lines */}
        <div
          className="relative flex items-center justify-center px-2.5 bg-background"
          style={{ height: `${DND_TITLE_ORNAMENT_GEOMETRY.height}px` }}
        >
          {/* Top Double Line */}
          <div
            className="absolute top-[1.5px] left-0 right-0"
            style={{
              height: `${DND_TITLE_ORNAMENT_GEOMETRY.topOuterStrokeWidth}px`,
              backgroundColor: color,
            }}
          />
          <div
            className="absolute top-[4px] left-0 right-0"
            style={{
              height: `${DND_TITLE_ORNAMENT_GEOMETRY.topInnerStrokeWidth}px`,
              backgroundColor: color,
            }}
          />

          {/* Center Text */}
          <span style={typographyStyle} className="text-foreground select-none">
            {text}
          </span>

          {/* Bottom Double Line */}
          <div
            className="absolute bottom-[4px] left-0 right-0"
            style={{
              height: `${DND_TITLE_ORNAMENT_GEOMETRY.bottomInnerStrokeWidth}px`,
              backgroundColor: color,
            }}
          />
          <div
            className="absolute bottom-[1.5px] left-0 right-0"
            style={{
              height: `${DND_TITLE_ORNAMENT_GEOMETRY.bottomOuterStrokeWidth}px`,
              backgroundColor: color,
            }}
          />
        </div>

        {/* Right Mirrored D&D Pointed Facet Cap */}
        <svg
          width={DND_TITLE_ORNAMENT_GEOMETRY.capWidth}
          height={DND_TITLE_ORNAMENT_GEOMETRY.height}
          viewBox="0 0 18 22"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <g transform="scale(-1, 1) translate(-18, 0)">
            <path
              d={DND_TITLE_ORNAMENT_GEOMETRY.capMaskPath}
              fill="var(--background, #ffffff)"
            />
            <path
              d={DND_TITLE_ORNAMENT_GEOMETRY.outerCapPath}
              stroke={color}
              strokeWidth={DND_TITLE_ORNAMENT_GEOMETRY.topOuterStrokeWidth}
              fill="none"
            />
            <path
              d={DND_TITLE_ORNAMENT_GEOMETRY.innerCapPath}
              stroke={color}
              strokeWidth={DND_TITLE_ORNAMENT_GEOMETRY.topInnerStrokeWidth}
              fill="none"
            />
            <path
              d={DND_TITLE_ORNAMENT_GEOMETRY.diamondMarkerPath}
              fill={color}
            />
          </g>
        </svg>
      </div>
    );
  }

  // Legacy pill fallback
  return (
    <div
      style={containerStyle}
      className="px-2.5 py-0.5 rounded bg-background border shadow-xs"
    >
      <span style={typographyStyle} className="text-foreground select-none">
        {text}
      </span>
    </div>
  );
};

export const FrameDecorator: React.FC<FrameDecoratorProps> = ({
  strokeColor,
  strokeWidth,
  cornerRadius,
  cornerOrnaments,
  topOrnament,
  bottomOrnament,
  ornamentStyle,
  titleDock,
  footerDock,
  children,
  className = "",
}) => {
  const color = STROKE_COLORS[strokeColor] || STROKE_COLORS.default;

  // Resolve active corner ornaments
  const activeCorners: CornerOrnaments = cornerOrnaments ?? {
    preset: ornamentStyle === "arc-corner" ? "arc-corner" : "none",
    topLeft: true,
    topRight: true,
    bottomRight: true,
    bottomLeft: true,
  };

  // Resolve top edge ornament
  const activeTop: EdgeOrnament = topOrnament ?? {
    preset: titleDock && titleDock.dock === "top" && titleDock.variant !== "none" ? "legacy-pill" : "none",
    align: titleDock?.variant?.includes("center") ? "center" : "start",
    offset: 0,
    text: titleDock?.text || "",
    fontFamily: "Montserrat Alternates",
    fontSize: 10,
    fontWeight: "medium",
    letterSpacingPx: -0.9,
  };

  // Resolve bottom edge ornament
  const activeBottom: EdgeOrnament = bottomOrnament ?? {
    preset: footerDock && footerDock.dock === "bottom" && footerDock.variant !== "none" ? "legacy-pill" : "none",
    align: footerDock?.variant?.includes("center") ? "center" : "start",
    offset: 0,
    text: footerDock?.text || "",
    fontFamily: "Montserrat Alternates",
    fontSize: 10,
    fontWeight: "medium",
    letterSpacingPx: -0.9,
  };

  return (
    <div
      className={`relative box-border transition-colors ${className}`}
      style={{
        borderTopWidth: strokeWidth.top,
        borderRightWidth: strokeWidth.right,
        borderBottomWidth: strokeWidth.bottom,
        borderLeftWidth: strokeWidth.left,
        borderTopLeftRadius: cornerRadius.topLeft,
        borderTopRightRadius: cornerRadius.topRight,
        borderBottomRightRadius: cornerRadius.bottomRight,
        borderBottomLeftRadius: cornerRadius.bottomLeft,
        borderColor: color,
        borderStyle: strokeColor === "none" ? "none" : "solid",
      }}
    >
      {/* Fate Corner Turnbacks */}
      {activeCorners.preset === "fate-turnback" && (
        <>
          {activeCorners.topLeft && <FateCornerTurnback corner="topLeft" color={color} />}
          {activeCorners.topRight && <FateCornerTurnback corner="topRight" color={color} />}
          {activeCorners.bottomRight && <FateCornerTurnback corner="bottomRight" color={color} />}
          {activeCorners.bottomLeft && <FateCornerTurnback corner="bottomLeft" color={color} />}
        </>
      )}

      {/* Legacy Arc-Corner fallback */}
      {activeCorners.preset === "arc-corner" && (
        <svg
          className="absolute inset-0 pointer-events-none w-full h-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {activeCorners.topLeft && (
            <path d="M 0,12 A 12,12 0 0,0 12,0" stroke={color} strokeWidth="1" fill="none" />
          )}
          {activeCorners.topRight && (
            <path d="M 100%,12 A 12,12 0 0,1 calc(100% - 12px),0" stroke={color} strokeWidth="1" fill="none" />
          )}
        </svg>
      )}

      {/* Top Edge Ornament */}
      <RenderEdgeOrnament ornament={activeTop} dock="top" color={color} />

      {children}

      {/* Bottom Edge Ornament */}
      <RenderEdgeOrnament ornament={activeBottom} dock="bottom" color={color} />
    </div>
  );
};
