"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
import { useSheetRender } from "./sheet-render-context";

function applyComponentOverrides(
  root: LayoutNode,
  exposedProperties: Array<{
    propertyId: string;
    targetNodeId: string;
    targetPropPath: string;
  }>,
  overrides: Record<string, string | number | boolean | null>,
): LayoutNode {
  const clone = structuredClone(root);
  const findNode = (node: LayoutNode, id: string): LayoutNode | undefined => {
    if (node.id === id) return node;
    if ("children" in node) {
      for (const child of node.children) {
        const found = findNode(child, id);
        if (found) return found;
      }
    }
    if ("rowTemplate" in node) return findNode(node.rowTemplate, id);
    return undefined;
  };
  for (const property of exposedProperties) {
    if (!(property.propertyId in overrides)) continue;
    const targetNode = findNode(clone, property.targetNodeId);
    if (!targetNode) continue;
    const parts = property.targetPropPath.split(".");
    let target: Record<string, unknown> = targetNode as unknown as Record<
      string,
      unknown
    >;
    for (const part of parts.slice(0, -1)) {
      const next = target[part];
      if (!next || typeof next !== "object" || Array.isArray(next)) break;
      target = next as Record<string, unknown>;
    }
    const leaf = parts.at(-1);
    if (leaf) target[leaf] = overrides[property.propertyId];
  }
  return clone;
}

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
}> = ({ node, parentDirection }) => {
  const t = useTranslations("SheetBuilder");
  const { target, mode, fieldValues, selectedNodeId, onSelectNode, resolvedComponents } =
    useSheetRender();

  // Hidden on current target?
  if (node.box?.hiddenOnTargets?.includes(target)) {
    if (mode !== "builder") return null;
  }

  const isSelected = mode === "builder" && selectedNodeId === node.id;
  const isHiddenInBuilder =
    mode === "builder" && node.box?.hiddenOnTargets?.includes(target);

  // Compute inline styles from box model
  const sizingStyle: React.CSSProperties = {
    minWidth: node.box.minWidth,
    maxWidth: node.box.maxWidth,
    minHeight: node.box.minHeight,
    maxHeight: node.box.maxHeight,
    boxSizing: "border-box",
  };

  const contentBoxStyle: React.CSSProperties = {
    paddingTop: node.box.padding.top,
    paddingRight: node.box.padding.right,
    paddingBottom: node.box.padding.bottom,
    paddingLeft: node.box.padding.left,
    overflow: node.box.overflow,
    boxSizing: "border-box",
  };

  if (node.box.width.mode === "fixed") {
    sizingStyle.width = `${node.box.width.value}px`;
    sizingStyle.flexShrink = 0;
  }
  if (node.box.height.mode === "fixed") {
    if (mode === "builder") {
      sizingStyle.height = `${node.box.height.value}px`;
    } else {
      sizingStyle.minHeight = Math.max(
        node.box.minHeight ?? 0,
        node.box.height.value,
      );
    }
    sizingStyle.flexShrink = 0;
  }

  const savedImageAspectRatio =
    node.kind === "image"
      ? fieldValues?.[`__image_aspect_ratio__:${node.fieldBinding}`]
      : undefined;
  const followsSavedImageAspectRatio =
    mode !== "builder" &&
    node.kind === "image" &&
    typeof savedImageAspectRatio === "number" &&
    savedImageAspectRatio > 0;
  if (followsSavedImageAspectRatio) {
    sizingStyle.height = undefined;
    sizingStyle.minHeight = undefined;
    sizingStyle.maxHeight = undefined;
  }

  const widthClass =
    node.box.width.mode === "fill"
      ? `w-full min-w-0 ${parentDirection === "horizontal" ? "flex-1" : ""}`
      : node.box.width.mode === "hug"
        ? "w-fit max-w-full"
        : "";

  const heightClass =
    followsSavedImageAspectRatio
      ? ""
      : node.box.height.mode === "fill"
      ? `${mode === "builder" ? "h-full" : ""} min-h-0 ${parentDirection === "vertical" ? "flex-1" : ""}`
      : node.box.height.mode === "hug"
        ? "h-fit"
        : "";

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
            ? "[&>*+*]:-ml-px"
            : "[&>*+*]:-mt-px"
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
            className={`${fillClass} w-full ${
              node.box.height.mode === "hug" ? "" : "h-full min-h-0"
            }`}
          >
            <div
              style={{
                ...contentBoxStyle,
                gap: `${node.collapseAdjacentStrokes ? 0 : (node.gap ?? 0)}px`,
              }}
              className={`${directionClass} ${alignClass} ${justifyClass} ${wrapClass} ${collapseClass} w-full ${
                node.box.height.mode === "hug" ? "" : "h-full min-h-0"
              }`}
            >
              {node.children.map((child) => (
                <SheetNodeRenderer
                  key={child.id}
                  node={child}
                  parentDirection={node.direction}
                />
              ))}
              {node.children.length === 0 && mode === "builder" && (
                <div className="w-full py-4 border border-dashed border-muted-foreground/30 rounded text-center text-xs text-muted-foreground italic select-none">
                  {t("emptyFrame")}
                </div>
              )}
            </div>
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

        return <SheetNodeRenderer node={overriddenRoot} />;
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
        className={`relative transition-all cursor-pointer ${widthClass} ${heightClass} ${
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
      className={`${widthClass} ${heightClass}`}
    >
      {renderContent()}
    </div>
  );
};
