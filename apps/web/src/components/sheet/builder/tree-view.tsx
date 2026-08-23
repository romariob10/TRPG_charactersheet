"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  CheckSquare,
  ChevronRight,
  Columns2,
  Copy,
  Diamond,
  FormInput,
  Hash,
  Image as ImageIcon,
  ListFilter,
  Minus,
  MoveVertical,
  Repeat,
  Rows2,
  Trash2,
  Type,
  WrapText,
} from "lucide-react";
import type { LayoutNode } from "@mycharacter/contracts";
import { canDropNode } from "../../../lib/tree-utils";

interface TreeViewProps {
  rootNode: LayoutNode;
  selectedNodeId: string | null;
  expandedNodeIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelectNode: (id: string | null) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onRenameNode: (id: string, name: string) => void;
  onMoveNodeHierarchy: (
    draggedId: string,
    targetId: string,
    position: "before" | "inside" | "after",
  ) => void;
}

interface DragState {
  draggedId: string;
  targetId: string | null;
  position: "before" | "inside" | "after";
  isValid: boolean;
}

export const TreeView: React.FC<TreeViewProps> = ({
  rootNode,
  selectedNodeId,
  expandedNodeIds,
  onToggleExpand,
  onSelectNode,
  onDeleteNode,
  onDuplicateNode,
  onRenameNode,
  onMoveNodeHierarchy,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Auto-scroll selected node row into view
  useEffect(() => {
    if (selectedNodeId) {
      const el = rowRefs.current.get(selectedNodeId);
      if (el) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedNodeId]);

  const handleStartRename = (id: string, currentName?: string, kind?: string) => {
    setEditingId(id);
    setEditingName(currentName || kind || "");
  };

  const handleCommitRename = () => {
    if (editingId && editingName.trim()) {
      onRenameNode(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName("");
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditingName("");
  };

  // Pointer DnD handlers
  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    nodeId: string,
  ) => {
    if (nodeId === rootNode.id) return; // Cannot drag root
    if (editingId) return; // Don't drag while renaming
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("input")) {
      return;
    }

    const targetEl = e.currentTarget;
    targetEl.setPointerCapture(e.pointerId);

    setDragState({
      draggedId: nodeId,
      targetId: null,
      position: "inside",
      isValid: false,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;

    // Hit test across registered row DOM elements
    let hoveredId: string | null = null;
    let hoveredPos: "before" | "inside" | "after" = "inside";

    for (const [id, el] of rowRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        hoveredId = id;
        const relativeY = (e.clientY - rect.top) / rect.height;

        if (relativeY < 0.25) {
          hoveredPos = "before";
        } else if (relativeY > 0.75) {
          hoveredPos = "after";
        } else {
          hoveredPos = "inside";
        }
        break;
      }
    }

    if (hoveredId) {
      const valid = canDropNode(rootNode, dragState.draggedId, hoveredId, hoveredPos);
      setDragState((prev) =>
        prev
          ? {
              ...prev,
              targetId: hoveredId,
              position: hoveredPos,
              isValid: valid,
            }
          : null,
      );
    } else {
      setDragState((prev) =>
        prev
          ? {
              ...prev,
              targetId: null,
              isValid: false,
            }
          : null,
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore if already released
    }

    if (dragState.isValid && dragState.targetId) {
      onMoveNodeHierarchy(
        dragState.draggedId,
        dragState.targetId,
        dragState.position,
      );
    }

    setDragState(null);
  };

  const getNodeIcon = (node: LayoutNode) => {
    switch (node.kind) {
      case "frame": {
        if (node.direction === "horizontal") {
          return node.wrap ? (
            <WrapText className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <Columns2 className="w-3.5 h-3.5 text-muted-foreground" />
          );
        }
        return <Rows2 className="w-3.5 h-3.5 text-muted-foreground" />;
      }
      case "component-instance":
        return <Diamond className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />;
      case "repeater":
        return <Repeat className="w-3.5 h-3.5 text-indigo-500" />;
      case "text":
        return <Type className="w-3.5 h-3.5 text-muted-foreground" />;
      case "field-input":
        return <FormInput className="w-3.5 h-3.5 text-muted-foreground" />;
      case "number-input":
        return <Hash className="w-3.5 h-3.5 text-muted-foreground" />;
      case "textarea":
        return <AlignLeft className="w-3.5 h-3.5 text-muted-foreground" />;
      case "checkbox":
        return <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />;
      case "select":
        return <ListFilter className="w-3.5 h-3.5 text-muted-foreground" />;
      case "image":
        return <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />;
      case "divider":
        return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
      case "spacer":
        return <MoveVertical className="w-3.5 h-3.5 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const renderTreeNode = (node: LayoutNode, depth = 0) => {
    const isSelected = selectedNodeId === node.id;
    const isFrame = node.kind === "frame";
    const isRepeater = node.kind === "repeater";
    const hasChildren =
      (isFrame && node.children.length > 0) || isRepeater;
    const isExpanded = expandedNodeIds.has(node.id);
    const isEditing = editingId === node.id;

    // DnD visual status
    const isDragTarget = dragState?.targetId === node.id;
    const dropPos = isDragTarget ? dragState.position : null;
    const isValidDrop = isDragTarget ? dragState.isValid : false;

    let dropIndicatorClass = "";
    if (isDragTarget) {
      if (dropPos === "before") {
        dropIndicatorClass = isValidDrop
          ? "border-t-2 border-primary"
          : "border-t-2 border-destructive";
      } else if (dropPos === "after") {
        dropIndicatorClass = isValidDrop
          ? "border-b-2 border-primary"
          : "border-b-2 border-destructive";
      } else if (dropPos === "inside") {
        dropIndicatorClass = isValidDrop
          ? "ring-2 ring-primary bg-primary/10"
          : "ring-2 ring-destructive bg-destructive/10";
      }
    }

    const displayName =
      node.name ||
      (node.kind === "frame"
        ? node.direction === "horizontal"
          ? "Horizontal Frame"
          : "Vertical Frame"
        : `${node.kind} (${node.id.slice(0, 4)})`);

    return (
      <div key={node.id} className="flex flex-col select-none relative">
        <div
          ref={(el) => {
            if (el) rowRefs.current.set(node.id, el);
            else rowRefs.current.delete(node.id);
          }}
          tabIndex={0}
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={isSelected}
          aria-label={displayName}
          onClick={() => onSelectNode(node.id)}
          onDoubleClick={() => handleStartRename(node.id, node.name, node.kind)}
          onPointerDown={(e) => handlePointerDown(e, node.id)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          className={`flex items-center justify-between py-1.5 pr-2 rounded-md text-xs cursor-pointer group transition-colors relative outline-none focus-visible:ring-1 focus-visible:ring-primary ${
            isSelected
              ? "bg-primary text-primary-foreground font-medium"
              : "hover:bg-muted/70 text-foreground"
          } ${dropIndicatorClass}`}
        >
          {/* Indentation guide lines */}
          {depth > 0 && (
            <div
              className="absolute top-0 bottom-0 border-l border-border/40 pointer-events-none"
              style={{ left: `${(depth - 1) * 14 + 12}px` }}
            />
          )}

          <div className="flex items-center gap-1.5 min-w-0 truncate">
            {/* Expand / Collapse Chevron */}
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(node.id);
                }}
                className="p-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-transform"
                title={isExpanded ? "Collapse" : "Expand"}
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                <ChevronRight
                  className={`w-3.5 h-3.5 transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
              </button>
            ) : (
              <span className="w-3.5 h-3.5 inline-block" />
            )}

            {/* Node Icon */}
            <span className="flex-shrink-0">{getNodeIcon(node)}</span>

            {/* Layer Name / Renaming Input */}
            {isEditing ? (
              <input
                type="text"
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleCommitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCommitRename();
                  else if (e.key === "Escape") handleCancelRename();
                }}
                onClick={(e) => e.stopPropagation()}
                className="h-5 px-1 bg-background text-foreground border border-primary rounded text-xs outline-none"
              />
            ) : (
              <span className="truncate text-xs select-none">
                {displayName}
              </span>
            )}
          </div>

          {/* Quick Actions (Duplicate, Delete) */}
          <div
            className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${
              isSelected ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateNode(node.id);
              }}
              title="Duplicate"
              aria-label="Duplicate"
              className="p-1 hover:text-foreground rounded"
            >
              <Copy className="w-3 h-3" />
            </button>
            {node.id !== rootNode.id && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNode(node.id);
                }}
                title="Delete"
                aria-label="Delete"
                className="p-1 hover:text-destructive rounded"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Child Nodes */}
        {isFrame && isExpanded && node.children.length > 0 && (
          <div className="flex flex-col">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}

        {isRepeater && isExpanded && (
          <div className="flex flex-col">
            {renderTreeNode(node.rowTemplate, depth + 1)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      role="tree"
      className="flex flex-col gap-0.5 p-2 overflow-y-auto max-h-[calc(100vh-280px)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onSelectNode(null);
        }
      }}
    >
      {renderTreeNode(rootNode)}
    </div>
  );
};
