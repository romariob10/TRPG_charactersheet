/**
 * Shared geometric specifications and vector path definitions for frame ornaments.
 * Single source of truth consumed by both web renderer (SVG) and PDF generator (PDF-lib vector drawing).
 */

export interface VectorPathDefinition {
  d: string;
  strokeWidth?: number;
  fill?: string;
  stroke?: string;
}

export const FATE_CORNER_TURNBACK_GEOMETRY = {
  viewBox: "0 0 10 10",
  width: 10,
  height: 10,
  offsetPx: -1,
  // Mask to block out the frame border underneath the curved corner
  maskPath: "M 0,0 L 8,0 A 8,8 0 0,1 0,8 Z",
  // Inner concentric arc (r=8, stroke 1.0)
  innerArcPath: "M 8,0 A 8,8 0 0,1 0,8",
  innerArcStrokeWidth: 1.0,
  // Outer concentric arc (r=10, stroke 0.5)
  outerArcPath: "M 10,0 A 10,10 0 0,1 0,10",
  outerArcStrokeWidth: 0.5,
  rotations: {
    topLeft: 0,
    topRight: 90,
    bottomRight: 180,
    bottomLeft: 270,
  },
} as const;

export const FATE_TITLE_ORNAMENT_GEOMETRY = {
  height: 20,
  capWidth: 14,
  // Left end cap bracket vector
  leftCapPath: "M 14,1.5 L 5,1.5 L 1.5,10 L 5,18.5 L 14,18.5",
  // Left cap background fill shape
  leftCapMaskPath: "M 14,0 L 4,0 L 0,10 L 4,20 L 14,20 Z",
  topLineStrokeWidth: 0.5,
  bottomLineStrokeWidth: 1.5,
  defaultFontFamily: "Montserrat Alternates",
  defaultFontSize: 10,
  defaultFontWeight: "medium" as const,
  defaultLetterSpacingPx: -0.9,
} as const;

export const DND_TITLE_ORNAMENT_GEOMETRY = {
  height: 22,
  capWidth: 18,
  // Outer hexagonal faceted point
  outerCapPath: "M 18,1.5 L 8.5,1.5 L 1.5,11 L 8.5,20.5 L 18,20.5",
  // Inner contour line
  innerCapPath: "M 18,4 L 10,4 L 4.5,11 L 10,18 L 18,18",
  // End cap mask background fill
  capMaskPath: "M 18,0 L 7.5,0 L 0,11 L 7.5,22 L 18,22 Z",
  // Diamond marker icon in the cap
  diamondMarkerPath: "M 11,8.5 L 13.5,11 L 11,13.5 L 8.5,11 Z",
  topOuterStrokeWidth: 1.0,
  topInnerStrokeWidth: 0.75,
  bottomOuterStrokeWidth: 1.0,
  bottomInnerStrokeWidth: 0.75,
  defaultFontFamily: "Montserrat Alternates",
  defaultFontSize: 10,
  defaultFontWeight: "bold" as const,
  defaultLetterSpacingPx: 0.5,
} as const;
