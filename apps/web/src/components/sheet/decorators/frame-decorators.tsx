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
  DND_CHEVRON_TITLE_ORNAMENT_GEOMETRY,
  DND_DIAMOND_TITLE_ORNAMENT_GEOMETRY,
  FATE_CORNER_TURNBACK_GEOMETRY,
  FATE_TITLE_ORNAMENT_GEOMETRY,
} from "@mycharacter/contracts";

interface FrameDecoratorProps {
  strokeColor: StrokeToken;
  strokeWidth: { top: number; right: number; bottom: number; left: number };
  cornerRadius: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
  maskColor: string;
  cornerOrnaments?: CornerOrnaments;
  topOrnament?: EdgeOrnament;
  bottomOrnament?: EdgeOrnament;
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
  ink: "#000000",
};

type Corner = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

const FateCornerTurnback: React.FC<{
  corner: Corner;
  color: string;
  maskColor: string;
}> = ({ corner, color, maskColor }) => {
  const geometry = FATE_CORNER_TURNBACK_GEOMETRY;
  const positionStyle: React.CSSProperties = {
    position: "absolute",
    width: geometry.width,
    height: geometry.height,
    pointerEvents: "none",
    zIndex: 10,
  };

  if (corner.includes("top")) positionStyle.top = geometry.offsetPx;
  else positionStyle.bottom = geometry.offsetPx;
  if (corner.includes("Left")) positionStyle.left = geometry.offsetPx;
  else positionStyle.right = geometry.offsetPx;

  return (
    <svg
      style={positionStyle}
      viewBox={geometry.viewBox}
      width={geometry.width}
      height={geometry.height}
      aria-hidden="true"
    >
      <g transform={`rotate(${geometry.rotations[corner] + 180} 5 5)`}>
        <path d={geometry.clipPath} fill={maskColor} />
        <circle
          cx={geometry.outerCircle.cx}
          cy={geometry.outerCircle.cy}
          r={geometry.outerCircle.radius}
          fill="none"
          stroke={color}
          strokeWidth={geometry.outerCircle.strokeWidth}
        />
        <circle
          cx={geometry.innerCircle.cx}
          cy={geometry.innerCircle.cy}
          r={geometry.innerCircle.radius}
          fill={maskColor}
          stroke={color}
          strokeWidth={geometry.innerCircle.strokeWidth}
        />
        <path
          d={geometry.diagonalPath}
          fill="none"
          stroke={color}
          strokeWidth={geometry.diagonalStrokeWidth}
        />
      </g>
    </svg>
  );
};

type EdgeGeometry = {
  height: number;
  capWidth: number;
  viewBox: string;
  leftOuterPath: string;
  leftInnerPath: string;
  rightOuterPath: string;
  rightInnerPath: string;
  outerStrokeWidth: number;
  innerStrokeWidth: number;
  innerTopLineY: number;
  innerBottomLineY: number;
};

const EdgeCap: React.FC<{
  geometry: EdgeGeometry;
  side: "left" | "right";
  color: string;
  maskColor: string;
}> = ({ geometry, side, color, maskColor }) => {
  return (
    <svg
      width={geometry.capWidth}
      height={geometry.height}
      viewBox={geometry.viewBox}
      className="shrink-0"
      aria-hidden="true"
    >
      <g>
        <path
          d={side === "left" ? geometry.leftOuterPath : geometry.rightOuterPath}
          fill={maskColor}
          stroke={color}
          strokeWidth={geometry.outerStrokeWidth}
        />
        <path
          d={side === "left" ? geometry.leftInnerPath : geometry.rightInnerPath}
          fill="none"
          stroke={color}
          strokeWidth={geometry.innerStrokeWidth}
        />
      </g>
    </svg>
  );
};

const RenderEdgeOrnament: React.FC<{
  ornament: EdgeOrnament;
  dock: "top" | "bottom";
  color: string;
  maskColor: string;
}> = ({ ornament, dock, color, maskColor }) => {
  if (ornament.preset === "none" || !ornament.text.trim()) return null;

  const { preset, align, offset, text, fontFamily, fontSize, fontWeight, letterSpacingPx } =
    ornament;
  const isFate = preset === "fate";
  const isDiamond = preset === "dnd-diamond";
  const isDnd =
    preset === "dnd" || preset === "dnd-chevron" || preset === "dnd-diamond";
  const geometry: EdgeGeometry = isFate
    ? FATE_TITLE_ORNAMENT_GEOMETRY
    : isDiamond
      ? DND_DIAMOND_TITLE_ORNAMENT_GEOMETRY
      : DND_CHEVRON_TITLE_ORNAMENT_GEOMETRY;

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    zIndex: 15,
    display: "flex",
    alignItems: "stretch",
    whiteSpace: "nowrap",
    userSelect: "none",
    [dock]: -geometry.height / 2,
  };
  if (align === "center") {
    containerStyle.left = `calc(50% + ${offset}px)`;
    containerStyle.transform = "translateX(-50%)";
  } else if (align === "start") {
    containerStyle.left = `calc(5px + ${offset}px)`;
  } else {
    containerStyle.right = `calc(5px - ${offset}px)`;
  }

  const typographyStyle: React.CSSProperties = {
    fontFamily:
      fontFamily === "Montserrat Alternates"
        ? 'var(--font-montserrat-alternates, "Montserrat Alternates"), sans-serif'
        : fontFamily === "Noto Sans"
          ? 'var(--font-noto-sans, "Noto Sans"), sans-serif'
          : "inherit",
    fontSize,
    fontWeight:
      fontWeight === "bold" || fontWeight === "700"
        ? 700
        : fontWeight === "600"
          ? 600
          : fontWeight === "medium" || fontWeight === "500"
            ? 500
            : 400,
    letterSpacing: letterSpacingPx,
    lineHeight: 1,
  };

  if (!isFate && !isDnd) {
    return (
      <div
        style={{ ...containerStyle, backgroundColor: maskColor }}
        className="px-0.5 py-0.5"
      >
        <span
          className="relative z-10 px-0.5"
          style={{ ...typographyStyle, backgroundColor: maskColor }}
        >
          {text}
        </span>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <EdgeCap
        geometry={geometry}
        side="left"
        color={color}
        maskColor={maskColor}
      />
      <div
        className="relative flex items-center justify-center px-2"
        style={{
          height: geometry.height,
          minWidth: 24,
          backgroundColor: maskColor,
          borderTop: `${geometry.outerStrokeWidth}px solid ${color}`,
          borderBottom: `${geometry.outerStrokeWidth}px solid ${color}`,
        }}
      >
        <span
          className="absolute left-0 right-0"
          style={{
            top: geometry.innerTopLineY,
            borderTop: `${geometry.innerStrokeWidth}px solid ${color}`,
          }}
        />
        <span style={typographyStyle}>{text}</span>
        <span
          className="absolute left-0 right-0"
          style={{
            top: geometry.innerBottomLineY,
            borderTop: `${geometry.innerStrokeWidth}px solid ${color}`,
          }}
        />
      </div>
      <EdgeCap
        geometry={geometry}
        side="right"
        color={color}
        maskColor={maskColor}
      />
    </div>
  );
};

export const FrameDecorator: React.FC<FrameDecoratorProps> = ({
  strokeColor,
  strokeWidth,
  cornerRadius,
  maskColor,
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
  const activeCorners: CornerOrnaments = cornerOrnaments ?? {
    preset: ornamentStyle === "arc-corner" ? "arc-corner" : "none",
    topLeft: true,
    topRight: true,
    bottomRight: true,
    bottomLeft: true,
  };
  const activeTop: EdgeOrnament = topOrnament ?? {
    preset:
      titleDock && titleDock.dock === "top" && titleDock.variant !== "none"
        ? "legacy-pill"
        : "none",
    align: titleDock?.variant?.includes("center") ? "center" : "start",
    offset: 0,
    text: titleDock?.text || "",
    fontFamily: "Montserrat Alternates",
    fontSize: 10,
    fontWeight: "medium",
    letterSpacingPx: -0.9,
  };
  const activeBottom: EdgeOrnament = bottomOrnament ?? {
    preset:
      footerDock && footerDock.dock === "bottom" && footerDock.variant !== "none"
        ? "legacy-pill"
        : "none",
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
      {(activeCorners.preset === "fate-turnback" ||
        activeCorners.preset === "arc-corner") &&
        (["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).map(
          (corner) =>
            activeCorners[corner] && (
              <FateCornerTurnback
                key={corner}
                corner={corner}
                color={color}
                maskColor={maskColor}
              />
            ),
        )}

      <RenderEdgeOrnament
        ornament={activeTop}
        dock="top"
        color={color}
        maskColor={maskColor}
      />
      {children}
      <RenderEdgeOrnament
        ornament={activeBottom}
        dock="bottom"
        color={color}
        maskColor={maskColor}
      />
    </div>
  );
};
