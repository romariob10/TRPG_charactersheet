"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { applyComponentOverrides } from "@mycharacter/contracts";
import type { LayoutNode } from "@mycharacter/contracts";
import { FrameDecorator } from "../decorators/frame-decorators";
import {
  RenderCheckbox,
  RenderDivider,
  RenderFieldInput,
  RenderImage,
  RenderNumberInput,
  RenderSelect,
  RenderSpacer,
  RenderTable,
  RenderText,
  RenderTextarea,
} from "./primitive-renderers";
import { RepeaterRenderer } from "./repeater-renderer";
import { SheetRenderProvider, useSheetRender } from "./sheet-render-context";

const ALIGN_MAP = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

const JUSTIFY_MAP = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  "space-between": "justify-between",
};

const FILL_MAP = {
  transparent: "bg-transparent",
  surface: "bg-background",
  "surface-subtle": "bg-muted/40",
  card: "bg-card text-card-foreground shadow-sm",
  parchment: "bg-[#fef3c7]/20 dark:bg-[#78350f]/10",
  dark: "bg-foreground/5",
  "accent-subtle": "bg-accent/10",
};

const MASK_COLOR_MAP = {
  transparent: "var(--sheet-canvas-background, var(--background, #ffffff))",
  surface: "var(--background, #ffffff)",
  "surface-subtle": "var(--muted, #f5f5f5)",
  card: "var(--card, #ffffff)",
  parchment: "#fef3c7",
  dark: "var(--foreground, #111111)",
  "accent-subtle": "var(--accent, #f3f4f6)",
};

export const SheetNodeRenderer: React.FC<{
  node: LayoutNode;
  parentDirection?: "horizontal" | "vertical";
  parentSizing?: { width: boolean; height: boolean };
}> = ({ node, parentDirection, parentSizing }) => {
  const t = useTranslations("SheetBuilder");
  const context = useSheetRender();
  const {
    target,
    mode,
    fieldValues,
    selectedNodeId,
    onSelectNode,
    resolvedComponents,
  } = context;

  // Hidden on current target?
  if (node.box?.hiddenOnTargets?.includes(target)) {
    if (mode !== "builder") return null;
  }

  const isSelected = mode === "builder" && selectedNodeId === node.id;
  const isHiddenInBuilder =
    mode === "builder" && node.box?.hiddenOnTargets?.includes(target);

  const savedImageAspectRatio =
    node.kind === "image"
      ? fieldValues?.[`__image_aspect_ratio__:${node.fieldBinding}`]
      : undefined;
  const followsSavedImageAspectRatio =
    mode !== "builder" &&
    node.kind === "image" &&
    typeof savedImageAspectRatio === "number" &&
    savedImageAspectRatio > 0;

  // Fill divides the available main axis; on the cross axis it stretches.
  // A Hug parent has no free space to divide, so Fill uses its content size.
  const available = parentSizing ?? { width: true, height: target === "print" };
  const widthConstrained =
    node.box.width.mode === "fixed" ||
    (node.box.width.mode === "fill" && available.width) ||
    (node.box.minWidth ?? 0) > 0;
  const exactHeight = mode === "builder" || mode === "print";
  const heightConstrained =
    !followsSavedImageAspectRatio &&
      ((node.box.height.mode === "fixed" && exactHeight) ||
      (node.box.height.mode === "fill" && available.height) ||
        (exactHeight && (node.box.minHeight ?? 0) > 0));
  const fillsMainAxis =
    parentDirection === "horizontal"
      ? node.box.width.mode === "fill"
      : parentDirection === "vertical" &&
        node.box.height.mode === "fill" &&
        !followsSavedImageAspectRatio;
  const fillsCrossAxis =
    parentDirection === "horizontal"
      ? node.box.height.mode === "fill" && !followsSavedImageAspectRatio
      : parentDirection === "vertical" && node.box.width.mode === "fill";
  const parentMainAxisConstrained =
    parentDirection === "horizontal" ? available.width : available.height;

  const sizingStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: heightConstrained ? "minmax(0, 1fr)" : undefined,
    minWidth:
      node.box.minWidth ?? (node.box.width.mode === "fill" ? 0 : undefined),
    maxWidth: node.box.maxWidth,
    minHeight:
      node.box.minHeight ?? (node.box.height.mode === "fill" ? 0 : undefined),
    maxHeight: node.box.maxHeight,
    boxSizing: "border-box",
    flexGrow: fillsMainAxis ? 1 : 0,
    flexShrink: fillsMainAxis ? 1 : 0,
    flexBasis: fillsMainAxis && parentMainAxisConstrained ? 0 : "auto",
    alignSelf: fillsCrossAxis ? "stretch" : undefined,
    width:
      node.box.width.mode === "fixed"
        ? node.box.width.value
        : node.box.width.mode === "hug"
          ? "fit-content"
          : parentDirection
            ? undefined
            : "100%",
    height:
      node.box.height.mode === "hug"
        ? "fit-content"
        : node.box.height.mode === "fill" &&
            !parentDirection &&
            available.height
          ? "100%"
          : undefined,
  };
  if (node.box.height.mode === "fixed") {
    if (mode === "builder" || mode === "print")
      sizingStyle.height = node.box.height.value;
    else
      sizingStyle.minHeight = Math.max(
        node.box.minHeight ?? 0,
        node.box.height.value,
      );
  }
  if (followsSavedImageAspectRatio) {
    sizingStyle.height = undefined;
    sizingStyle.minHeight = undefined;
    sizingStyle.maxHeight = undefined;
  }

  const contentBoxStyle: React.CSSProperties = {
    paddingTop: node.box.padding.top,
    paddingRight: node.box.padding.right,
    paddingBottom: node.box.padding.bottom,
    paddingLeft: node.box.padding.left,
    overflow: mode === "print" && node.kind !== "frame" && heightConstrained ? "hidden" : node.box.overflow,
    boxSizing: "border-box",
  };

  const fillClass = FILL_MAP[node.box.fill] || "bg-transparent";

  const renderContent = () => {
    switch (node.kind) {
      case "text":
        return <RenderText node={node} />;
      case "field-input":
        return <RenderFieldInput node={node} />;
      case "number-input":
        return <RenderNumberInput node={node} />;
      case "textarea":
        return <RenderTextarea node={node} />;
      case "checkbox":
        return <RenderCheckbox node={node} />;
      case "select":
        return <RenderSelect node={node} />;
      case "image":
        return <RenderImage node={node} />;
      case "table":
        return <RenderTable node={node} />;
      case "divider":
        return <RenderDivider node={node} />;
      case "spacer":
        return <RenderSpacer node={node} />;
      case "repeater":
        return <RepeaterRenderer node={node} />;
      case "frame": {
        const directionClass =
          node.direction === "horizontal" ? "flex flex-row" : "flex flex-col";
        const alignClass = ALIGN_MAP[node.align] || "items-start";
        const justifyClass = JUSTIFY_MAP[node.justify] || "justify-start";
        const wrapClass = node.wrap ? "flex-wrap" : "flex-nowrap";
        const collapseClass = node.collapseAdjacentStrokes
          ? node.direction === "horizontal"
            ? "[&>[data-node-id]+[data-node-id]]:-ml-px"
            : "[&>[data-node-id]+[data-node-id]]:-mt-px"
          : "";

        return (
          <FrameDecorator
            cornerOrnaments={node.cornerOrnaments}
            topOrnament={node.topOrnament}
            bottomOrnament={node.bottomOrnament}
            ornamentStyle={node.ornamentStyle}
            strokeColor={node.box.strokeColor}
            strokeWidth={node.box.strokeWidth}
            cornerRadius={node.box.cornerRadius}
            maskColor={
              target === "print" ? "#ffffff" : MASK_COLOR_MAP[node.box.fill]
            }
            titleDock={node.titleDock}
            footerDock={node.footerDock}
            style={{
              ...contentBoxStyle,
              gap: node.collapseAdjacentStrokes ? 0 : node.gap,
            }}
            className={`${fillClass} ${directionClass} ${alignClass} ${justifyClass} ${wrapClass} ${collapseClass} min-w-0 min-h-0`}
          >
            {node.children.map((child) => (
              <SheetNodeRenderer
                key={child.id}
                node={child}
                parentDirection={node.direction}
                parentSizing={{
                  width: widthConstrained,
                  height: heightConstrained,
                }}
              />
            ))}
            {node.children.length === 0 && mode === "builder" && (
              <div className="w-full py-4 border border-dashed border-muted-foreground/30 rounded text-center text-xs text-muted-foreground italic select-none">
                {t("emptyFrame")}
              </div>
            )}
          </FrameDecorator>
        );
      }
      case "component-instance": {
        const compVersion = resolvedComponents?.get(node.componentVersionId);
        if (!compVersion) {
          return (
            <div className="p-3 border border-dashed border-amber-500/50 rounded bg-amber-50/20 text-xs text-amber-700 dark:text-amber-300">
              {t("componentInstance")} ({node.componentId.slice(0, 8)})
            </div>
          );
        }

        const compRootNode =
          compVersion.layouts[target] ?? compVersion.layouts.desktop;
        const overriddenRoot = applyComponentOverrides(
          compRootNode,
          compVersion.exposedProperties,
          node.propertyOverrides,
        );

        // The instance controls the component's outer size. Its template keeps
        // the padding, layout and appearance inside that allocated space.
        const instanceRoot: LayoutNode = {
          ...overriddenRoot,
          box: {
            ...overriddenRoot.box,
            width:
              node.box.width.mode === "hug"
                ? overriddenRoot.box.width
                : { mode: "fill" },
            height:
              node.box.height.mode === "hug"
                ? overriddenRoot.box.height
                : { mode: "fill" },
          },
        };
        return (
          <SheetRenderProvider
            value={{
              ...context,
              selectedNodeId: null,
              onSelectNode: () => onSelectNode?.(node.id),
            }}
          >
            <SheetNodeRenderer
              node={instanceRoot}
              parentDirection="vertical"
              parentSizing={{
                width: widthConstrained,
                height: heightConstrained,
              }}
            />
          </SheetRenderProvider>
        );
      }
      default:
        return null;
    }
  };

  if (mode === "builder") {
    return (
      <div
        data-node-id={node.id}
        onClick={(e) => {
          e.stopPropagation();
          onSelectNode?.(node.id);
        }}
        style={
          node.kind === "frame"
            ? sizingStyle
            : { ...sizingStyle, ...contentBoxStyle }
        }
        className={`relative transition-all cursor-pointer ${
          isSelected
            ? "ring-2 ring-primary ring-offset-1 z-20"
            : "hover:ring-1 hover:ring-primary/40"
        } ${isHiddenInBuilder ? "opacity-30 border border-dotted border-muted-foreground" : ""}`}
      >
        {isSelected && (
          <div className="absolute -top-5 left-0 px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-t z-30 uppercase tracking-wide">
            {node.name || node.kind}
          </div>
        )}
        {renderContent()}
      </div>
    );
  }

  return (
    <div
      style={
        node.kind === "frame"
          ? sizingStyle
          : { ...sizingStyle, ...contentBoxStyle }
      }
      data-node-id={node.id}
    >
      {renderContent()}
    </div>
  );
};
