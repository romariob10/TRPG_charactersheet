import React from "react";
import type { OrnamentStyle, StrokeToken, TitleDock } from "@mycharacter/contracts";

interface FrameDecoratorProps {
  ornamentStyle: OrnamentStyle;
  strokeColor: StrokeToken;
  strokeWidth: { top: number; right: number; bottom: number; left: number };
  cornerRadius: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
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

export const FrameDecorator: React.FC<FrameDecoratorProps> = ({
  ornamentStyle,
  strokeColor,
  strokeWidth,
  cornerRadius,
  titleDock,
  footerDock,
  children,
  className = "",
}) => {
  const color = STROKE_COLORS[strokeColor] || STROKE_COLORS.default;

  const hasTitleDock =
    titleDock && titleDock.dock === "top" && titleDock.variant !== "none" && titleDock.text;
  const hasFooterDock =
    footerDock && footerDock.dock === "bottom" && footerDock.variant !== "none" && footerDock.text;

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
      {/* Optional SVG Arc-Corner Ornaments */}
      {ornamentStyle === "arc-corner" && (
        <svg
          className="absolute inset-0 pointer-events-none w-full h-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M 0,12 A 12,12 0 0,0 12,0"
            stroke={color}
            strokeWidth="1"
            fill="none"
          />
          <path
            d="M 100%,12 A 12,12 0 0,1 calc(100% - 12px),0"
            stroke={color}
            strokeWidth="1"
            fill="none"
          />
        </svg>
      )}

      {/* Title Dock Header */}
      {hasTitleDock && (
        <div
          className={`absolute -top-3 px-2 text-xs font-bold uppercase tracking-wider bg-background text-foreground border rounded z-10 flex items-center gap-1 shadow-sm ${
            titleDock.variant === "inline-center" || titleDock.variant === "diamond-center"
              ? "left-1/2 -translate-x-1/2"
              : "left-4"
          }`}
          style={{ borderColor: color }}
        >
          {(titleDock.variant === "diamond-start" || titleDock.variant === "diamond-center") && (
            <span className="w-1.5 h-1.5 rotate-45 inline-block" style={{ backgroundColor: color }} />
          )}
          <span>{titleDock.text}</span>
          {titleDock.variant === "diamond-center" && (
            <span className="w-1.5 h-1.5 rotate-45 inline-block" style={{ backgroundColor: color }} />
          )}
        </div>
      )}

      {children}

      {/* Footer Dock */}
      {hasFooterDock && (
        <div
          className={`absolute -bottom-3 px-2 text-[10px] font-semibold uppercase tracking-wider bg-background text-muted-foreground border rounded z-10 flex items-center gap-1 ${
            footerDock.variant === "inline-center" || footerDock.variant === "diamond-center"
              ? "left-1/2 -translate-x-1/2"
              : "left-4"
          }`}
          style={{ borderColor: color }}
        >
          {(footerDock.variant === "diamond-start" || footerDock.variant === "diamond-center") && (
            <span className="w-1 h-1 rotate-45 inline-block" style={{ backgroundColor: color }} />
          )}
          <span>{footerDock.text}</span>
          {footerDock.variant === "diamond-center" && (
            <span className="w-1 h-1 rotate-45 inline-block" style={{ backgroundColor: color }} />
          )}
        </div>
      )}
    </div>
  );
};
