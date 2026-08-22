"use client";

import React from "react";
import type { LayoutNode } from "@mycharacter/contracts";

interface TreeViewProps {
  rootNode: LayoutNode;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onDeleteNode: (id: string) => void;
  onMoveNode: (id: string, direction: "up" | "down") => void;
  onDuplicateNode: (id: string) => void;
}

export const TreeView: React.FC<TreeViewProps> = ({
  rootNode,
  selectedNodeId,
  onSelectNode,
  onDeleteNode,
  onMoveNode,
  onDuplicateNode,
}) => {
  const renderTreeNode = (node: LayoutNode, depth = 0) => {
    const isSelected = selectedNodeId === node.id;
    const isFrame = node.kind === "frame";
    const isRepeater = node.kind === "repeater";

    const getIcon = () => {
      switch (node.kind) {
        case "frame":
          return "🗂️";
        case "text":
          return "🔤";
        case "field-input":
        case "number-input":
        case "textarea":
          return "📝";
        case "checkbox":
          return "☑️";
        case "select":
          return "📋";
        case "image":
          return "🖼️";
        case "repeater":
          return "🔁";
        case "component-instance":
          return "🧩";
        case "divider":
          return "➖";
        case "spacer":
          return "⬜";
        default:
          return "📦";
      }
    };

    return (
      <div key={node.id} className="flex flex-col select-none">
        <div
          onClick={() => onSelectNode(node.id)}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`flex items-center justify-between py-1.5 pr-2 rounded-md text-xs cursor-pointer group transition-colors ${
            isSelected
              ? "bg-primary text-primary-foreground font-semibold"
              : "hover:bg-muted text-foreground"
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-xs">{getIcon()}</span>
            <span className="truncate">
              {node.name || `${node.kind} (${node.id.slice(0, 4)})`}
            </span>
          </div>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveNode(node.id, "up");
              }}
              title="Move up"
              className="p-0.5 hover:text-primary rounded text-[10px]"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveNode(node.id, "down");
              }}
              title="Move down"
              className="p-0.5 hover:text-primary rounded text-[10px]"
            >
              ▼
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateNode(node.id);
              }}
              title="Duplicate"
              className="p-0.5 hover:text-primary rounded text-[10px]"
            >
              📋
            </button>
            {node.id !== rootNode.id && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNode(node.id);
                }}
                title="Delete"
                className="p-0.5 hover:text-destructive rounded text-[10px]"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {isFrame && node.children.length > 0 && (
          <div className="flex flex-col">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}

        {isRepeater && (
          <div className="flex flex-col">
            {renderTreeNode(node.rowTemplate, depth + 1)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto max-h-[calc(100vh-280px)]">
      {renderTreeNode(rootNode)}
    </div>
  );
};
