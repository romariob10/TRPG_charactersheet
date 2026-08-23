"use client";

import React from "react";
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
  RenderText,
  RenderTextarea,
} from "./primitive-renderers";
import { RepeaterRenderer } from "./repeater-renderer";
import { useSheetRender } from "./sheet-render-context";

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

export const SheetNodeRenderer: React.FC<{ node: LayoutNode }> = ({ node }) => {
  const { target, mode, selectedNodeId, onSelectNode, resolvedComponents } =
    useSheetRender();

  // Hidden on current target?
  if (node.box?.hiddenOnTargets?.includes(target)) {
    if (mode !== "builder") return null;
  }

  const isSelected = mode === "builder" && selectedNodeId === node.id;
  const isHiddenInBuilder =
    mode === "builder" && node.box?.hiddenOnTargets?.includes(target);

  // Compute inline styles from box model
  const boxStyle: React.CSSProperties = {
    paddingTop: node.box.padding.top,
    paddingRight: node.box.padding.right,
    paddingBottom: node.box.padding.bottom,
    paddingLeft: node.box.padding.left,
    minWidth: node.box.minWidth,
    maxWidth: node.box.maxWidth,
    minHeight: node.box.minHeight,
    maxHeight: node.box.maxHeight,
    overflow: node.box.overflow,
    boxSizing: "border-box",
  };

  if (node.box.width.mode === "fixed") {
    boxStyle.width = `${node.box.width.value}px`;
    boxStyle.flexShrink = 0;
  }
  if (node.box.height.mode === "fixed") {
    boxStyle.height = `${node.box.height.value}px`;
    boxStyle.flexShrink = 0;
  }

  const widthClass =
    node.box.width.mode === "fill"
      ? "w-full flex-1"
      : node.box.width.mode === "hug"
      ? "w-auto"
      : "";

  const heightClass =
    node.box.height.mode === "fill"
      ? "h-full flex-1"
      : node.box.height.mode === "hug"
      ? "h-auto"
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
      case "divider":
        return <RenderDivider node={node} />;
      case "spacer":
        return <RenderSpacer node={node} />;
      case "repeater":
        return <RepeaterRenderer node={node} />;
      case "frame": {
        const directionClass =
          node.direction === "horizontal"
            ? "flex flex-row"
            : "flex flex-col";
        const alignClass = ALIGN_MAP[node.align] || "items-start";
        const justifyClass = JUSTIFY_MAP[node.justify] || "justify-start";
        const wrapClass = node.wrap ? "flex-wrap" : "flex-nowrap";

        return (
          <FrameDecorator
            ornamentStyle={node.ornamentStyle}
            strokeColor={node.box.strokeColor}
            strokeWidth={node.box.strokeWidth}
            cornerRadius={node.box.cornerRadius}
            titleDock={node.titleDock}
            footerDock={node.footerDock}
            className={`${fillClass} ${widthClass} ${heightClass}`}
          >
            <div
              style={{
                ...boxStyle,
                gap: `${node.gap ?? 0}px`,
              }}
              className={`${directionClass} ${alignClass} ${justifyClass} ${wrapClass} ${widthClass} ${heightClass}`}
            >
              {node.children.map((child) => (
                <SheetNodeRenderer key={child.id} node={child} />
              ))}
              {node.children.length === 0 && mode === "builder" && (
                <div className="w-full py-4 border border-dashed border-muted-foreground/30 rounded text-center text-xs text-muted-foreground italic select-none">
                  Empty Frame (Drop or add items here)
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
              Component Instance ({node.componentId.slice(0, 8)})
            </div>
          );
        }

        const compRootNode =
          compVersion.layouts[target] ?? compVersion.layouts.desktop;

        return (
          <SheetNodeRenderer node={compRootNode} />
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
        style={node.kind !== "frame" ? boxStyle : undefined}
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
      style={node.kind !== "frame" ? boxStyle : undefined}
      className={`${widthClass} ${heightClass}`}
    >
      {renderContent()}
    </div>
  );
};
