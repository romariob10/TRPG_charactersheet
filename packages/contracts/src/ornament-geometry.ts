/**
 * Vector geometry copied from the referenced Figma nodes. The same paths and
 * dimensions are consumed by the browser renderer and the PDF renderer.
 */

export interface VectorPathDefinition {
  d: string;
  strokeWidth?: number;
  fill?: string;
  stroke?: string;
}

export const FATE_CORNER_TURNBACK_GEOMETRY = {
  sourceNodeId: "17:613",
  viewBox: "0 0 10 10",
  width: 10,
  height: 10,
  offsetPx: 0,
  clipPath: "M0 0H10V10H0Z",
  outerCircle: { cx: 10, cy: 10, radius: 9.75, strokeWidth: 0.5 },
  innerCircle: { cx: 10, cy: 10, radius: 7.5, strokeWidth: 1 },
  outerArcPath: "M10 0.25A9.75 9.75 0 0 0 0.25 10",
  innerArcPath: "M10 2.5A7.5 7.5 0 0 0 2.5 10",
  outerArcStrokeWidth: 0.5,
  innerArcStrokeWidth: 1,
  diagonalPath: "M3 3L5 5",
  diagonalStrokeWidth: 1,
  rotations: {
    topLeft: 0,
    topRight: 90,
    bottomRight: 180,
    bottomLeft: 270,
  },
} as const;

export const FATE_TITLE_ORNAMENT_GEOMETRY = {
  sourceNodeId: "17:589",
  height: 20,
  capWidth: 20,
  viewBox: "0 0 20 20",
  leftOuterPath: "M6 10L20 0.5H21V19.5H20L6 10Z",
  leftInnerPath:
    "M21 3.25H20L10 10L13 12.0357L20 16.75H21M13 12.0357L16 10L13 8",
  rightOuterPath: "M14 10L0 19.5H-1V0.5H0L14 10Z",
  rightInnerPath:
    "M-1 16.75H0L10 10L7 7.96429L0 3.25H-1M7 7.96429L4 10L7 12",
  outerStrokeWidth: 1,
  innerStrokeWidth: 0.5,
  outerTopLineY: 0.5,
  outerBottomLineY: 19.5,
  innerTopLineY: 3.25,
  innerBottomLineY: 16.75,
  topLineStrokeWidth: 1,
  bottomLineStrokeWidth: 1,
  defaultFontFamily: "Montserrat Alternates",
  defaultFontSize: 10,
  defaultFontWeight: "medium" as const,
  defaultLetterSpacingPx: -0.9,
} as const;

export const DND_CHEVRON_TITLE_ORNAMENT_GEOMETRY = {
  sourceNodeId: "67:2711",
  height: 18,
  capWidth: 18,
  viewBox: "0 0 18 18",
  leftOuterPath: "M5 9L17.1333 0.5H19V17.5H17.1333L5 9Z",
  leftInnerPath:
    "M18.5833 3.25H17.7121L9 9L11.6136 10.7341L17.7121 14.75H18.5833M11.6136 10.7341L14.2273 9L11.6136 7.2963",
  rightOuterPath: "M13 9L0.8667 0.5H-1V17.5H0.8667L13 9Z",
  rightInnerPath:
    "M-0.5833 3.25H0.2879L9 9L6.3864 10.7341L0.2879 14.75H-0.5833M6.3864 10.7341L3.7727 9L6.3864 7.2963",
  outerStrokeWidth: 1,
  innerStrokeWidth: 0.5,
  outerTopLineY: 0.5,
  outerBottomLineY: 17.5,
  innerTopLineY: 3.25,
  innerBottomLineY: 14.75,
  topOuterStrokeWidth: 1,
  topInnerStrokeWidth: 0.5,
  bottomOuterStrokeWidth: 1,
  bottomInnerStrokeWidth: 0.5,
  defaultFontFamily: "Montserrat Alternates",
  defaultFontSize: 8,
  defaultFontWeight: "medium" as const,
  defaultLetterSpacingPx: -0.72,
} as const;

export const DND_DIAMOND_TITLE_ORNAMENT_GEOMETRY = {
  sourceNodeId: "67:2363",
  height: 18,
  capWidth: 18,
  viewBox: "0 0 18 18",
  leftOuterPath: "M1 17.5L17.625 0.5H18.5V17.5H17.625H1Z",
  leftInnerPath:
    "M13.8065 10.7778L17.75 14.74H19M13.8065 10.7778L12 9L13.8065 7.22222M13.8065 10.7778L15.6129 9L13.8065 7.22222M13.8065 7.22222L17.75 3.25H19",
  rightOuterPath: "M17 17.5L0.375 0.5H-0.5V17.5H0.375H17Z",
  rightInnerPath:
    "M4.1935 10.7778L0.25 14.74H-1M4.1935 10.7778L6 9L4.1935 7.22222M4.1935 10.7778L2.3871 9L4.1935 7.22222M4.1935 7.22222L0.25 3.25H-1",
  outerStrokeWidth: 1,
  innerStrokeWidth: 0.5,
  outerTopLineY: 0.5,
  outerBottomLineY: 17.5,
  innerTopLineY: 3.25,
  innerBottomLineY: 14.75,
  defaultFontFamily: "Montserrat Alternates",
  defaultFontSize: 8,
  defaultFontWeight: "medium" as const,
  defaultLetterSpacingPx: -0.72,
} as const;

/** Backward-compatible name for layouts saved before both D&D variants existed. */
export const DND_TITLE_ORNAMENT_GEOMETRY =
  DND_CHEVRON_TITLE_ORNAMENT_GEOMETRY;
