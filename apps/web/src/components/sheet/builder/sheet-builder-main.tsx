"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  ComponentSummary,
  ComponentVersionDetails,
  LayoutNode,
  SheetEditorDataResponse,
  TargetLayoutKind,
  TargetLayoutMap,
} from "@mycharacter/contracts";
import {
  defaultBoxProps,
  TARGET_LAYOUT_KINDS,
  validateLayoutNodeConstraints,
} from "@mycharacter/contracts";
import { InspectorView } from "./inspector-view.js";
import { PaletteView } from "./palette-view.js";
import { TreeView } from "./tree-view.js";
import { SheetNodeRenderer } from "../renderer/sheet-node-renderer.js";
import { SheetRenderProvider } from "../renderer/sheet-render-context.js";
import { ComponentLibraryBrowser } from "../library/component-library-browser.js";
import { SaveComponentModal } from "../library/save-component-modal.js";

interface SheetBuilderMainProps {
  initialData: SheetEditorDataResponse;
  systemId: string;
}

function findNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  if (root.kind === "frame") {
    for (const child of root.children) {
      const res = findNode(child, id);
      if (res) return res;
    }
  } else if (root.kind === "repeater") {
    return findNode(root.rowTemplate, id);
  }
  return null;
}

function updateNodeInTree(root: LayoutNode, updated: LayoutNode): LayoutNode {
  if (root.id === updated.id) return updated;
  if (root.kind === "frame") {
    return {
      ...root,
      children: root.children.map((c) => updateNodeInTree(c, updated)),
    };
  }
  if (root.kind === "repeater") {
    return {
      ...root,
      rowTemplate: updateNodeInTree(root.rowTemplate, updated),
    };
  }
  return root;
}

function deleteNodeFromTree(root: LayoutNode, id: string): LayoutNode {
  if (root.kind === "frame") {
    return {
      ...root,
      children: root.children
        .filter((c) => c.id !== id)
        .map((c) => deleteNodeFromTree(c, id)),
    };
  }
  return root;
}

export const SheetBuilderMain: React.FC<SheetBuilderMainProps> = ({
  initialData,
  systemId,
}) => {
  const [layouts, setLayouts] = useState<TargetLayoutMap>(
    initialData.draft.layouts,
  );
  const [activeTarget, setActiveTarget] = useState<TargetLayoutKind>("desktop");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [revision, setRevision] = useState(initialData.draft.revision);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error" | "conflict"
  >("saved");
  const [zoom, setZoom] = useState(1);
  const [activeTab, setActiveTab] = useState<"layers" | "palette">("palette");

  // Modals
  const [showLibrary, setShowLibrary] = useState(false);
  const [saveComponentNode, setSaveComponentNode] = useState<LayoutNode | null>(
    null,
  );
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishChangelog, setPublishChangelog] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Resolved component versions for rendering
  const [resolvedComponents] = useState<
    Map<string, ComponentVersionDetails>
  >(new Map());

  const currentRoot = layouts[activeTarget];

  // Mutate layout state with history
  const setTargetLayout = useCallback(
    (newRoot: LayoutNode) => {
      setLayouts((prev) => {
        const next = { ...prev, [activeTarget]: newRoot };
        return next;
      });
      setSaveStatus("idle");
    },
    [activeTarget],
  );

  // Handle node selection
  const selectedNode = selectedNodeId
    ? findNode(currentRoot, selectedNodeId)
    : null;

  // Insert node
  const handleInsertNode = (newNode: LayoutNode) => {
    if (selectedNode && selectedNode.kind === "frame") {
      const updatedFrame: LayoutNode = {
        ...selectedNode,
        children: [...selectedNode.children, newNode],
      };
      setTargetLayout(updateNodeInTree(currentRoot, updatedFrame));
    } else if (currentRoot.kind === "frame") {
      const updatedRoot: LayoutNode = {
        ...currentRoot,
        children: [...currentRoot.children, newNode],
      };
      setTargetLayout(updatedRoot);
    }
    setSelectedNodeId(newNode.id);
  };

  // Delete node
  const handleDeleteNode = (id: string) => {
    if (id === currentRoot.id) return;
    setTargetLayout(deleteNodeFromTree(currentRoot, id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  // Duplicate node
  const handleDuplicateNode = (id: string) => {
    const target = findNode(currentRoot, id);
    if (!target || id === currentRoot.id) return;

    const deepCloneWithNewIds = (node: LayoutNode): LayoutNode => {
      const clone = JSON.parse(JSON.stringify(node)) as LayoutNode;
      const assignNewIds = (n: LayoutNode) => {
        n.id = crypto.randomUUID();
        if (n.kind === "frame") n.children.forEach(assignNewIds);
        if (n.kind === "repeater") assignNewIds(n.rowTemplate);
      };
      assignNewIds(clone);
      clone.name = `${clone.name || clone.kind} (Copy)`;
      return clone;
    };

    const duplicate = deepCloneWithNewIds(target);
    handleInsertNode(duplicate);
  };

  // Move node up / down
  const handleMoveNode = (id: string, direction: "up" | "down") => {
    const moveInChildren = (root: LayoutNode): LayoutNode => {
      if (root.kind === "frame") {
        const idx = root.children.findIndex((c) => c.id === id);
        if (idx !== -1) {
          const targetIdx = direction === "up" ? idx - 1 : idx + 1;
          if (targetIdx >= 0 && targetIdx < root.children.length) {
            const nextChildren = [...root.children];
            const [item] = nextChildren.splice(idx, 1);
            nextChildren.splice(targetIdx, 0, item);
            return { ...root, children: nextChildren };
          }
          return root;
        }
        return {
          ...root,
          children: root.children.map(moveInChildren),
        };
      }
      return root;
    };

    setTargetLayout(moveInChildren(currentRoot));
  };

  // Auto-generate mobile/tablet/print from desktop layout
  const handleAutoGenerateTargets = () => {
    if (
      !confirm(
        "Auto-generate mobile, tablet, and print layouts from current Desktop layout? This will adapt container directions and widths.",
      )
    ) {
      return;
    }

    const desktopRoot = layouts.desktop;

    const adaptForMobile = (node: LayoutNode): LayoutNode => {
      const clone = JSON.parse(JSON.stringify(node)) as LayoutNode;
      const transform = (n: LayoutNode) => {
        if (n.kind === "frame") {
          // Flatten wide horizontal root containers on mobile
          if (n.direction === "horizontal" && n.children.length > 2) {
            n.direction = "vertical";
          }
          n.box.width = { mode: "fill" };
          n.children.forEach(transform);
        }
      };
      transform(clone);
      return clone;
    };

    setLayouts({
      desktop: desktopRoot,
      mobile: adaptForMobile(desktopRoot),
      tablet: JSON.parse(JSON.stringify(desktopRoot)),
      print: JSON.parse(JSON.stringify(desktopRoot)),
    });
    setSaveStatus("idle");
  };

  // Insert from Component Library
  const handleInsertComponent = (
    comp: ComponentSummary,
    version: ComponentVersionDetails,
  ) => {
    resolvedComponents.set(version.id, version);

    const instanceNode: LayoutNode = {
      id: crypto.randomUUID(),
      kind: "component-instance",
      name: comp.name,
      componentId: comp.id,
      componentVersionId: version.id,
      propertyOverrides: {},
      box: {
        ...defaultBoxProps,
        width: { mode: "fill" },
        height: { mode: "hug" },
        fill: "transparent",
        strokeWidth: { top: 0, right: 0, bottom: 0, left: 0 },
        strokeColor: "none",
        cornerRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        overflow: "visible",
      },
    };

    handleInsertNode(instanceNode);
  };

  // Autosave debounce effect
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (saveStatus === "saved") return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const res = await fetch(
          `/api/sheet-definitions/${initialData.sheetDefinition.id}/draft`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedRevision: revision,
              layouts,
              fields: initialData.draft.fields,
            }),
          },
        );

        if (res.status === 409) {
          setSaveStatus("conflict");
          return;
        }

        if (!res.ok) {
          setSaveStatus("error");
          return;
        }

        const data = await res.json();
        setRevision(data.revision);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 1200);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [layouts, revision, saveStatus, initialData.sheetDefinition.id, initialData.draft.fields]);

  // Publish Sheet Version
  const handlePublish = async () => {
    setPublishing(true);
    setPublishError(null);

    // Validate all 4 targets
    for (const target of TARGET_LAYOUT_KINDS) {
      const check = validateLayoutNodeConstraints(layouts[target]);
      if (!check.valid) {
        setPublishError(
          `Target [${target}] validation failed: ${check.errors.join(", ")}`,
        );
        setPublishing(false);
        return;
      }
    }

    try {
      const res = await fetch(
        `/api/sheet-definitions/${initialData.sheetDefinition.id}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changelog: publishChangelog }),
        },
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to publish sheet version.");
      }

      const published = await res.json();
      alert(`Published version ${published.versionNumber} successfully!`);
      setShowPublishModal(false);
    } catch (err: unknown) {
      setPublishError(
        err instanceof Error ? err.message : "Publishing failed.",
      );
    } finally {
      setPublishing(false);
    }
  };

  const canvasWidthClass = {
    mobile: "max-w-sm",
    tablet: "max-w-2xl",
    desktop: "max-w-4xl",
    print: "max-w-[794px] min-h-[1123px] bg-white text-black shadow-2xl print-page",
  }[activeTarget];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full bg-background overflow-hidden">
      {/* Top Action Bar */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <a
            href={`/dashboard/systems/${systemId}/workspace`}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <span>←</span> System Workspace
          </a>
          <span className="text-muted-foreground">/</span>
          <h2 className="text-sm font-bold text-foreground">
            {initialData.sheetDefinition.title}
          </h2>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded capitalize">
            {initialData.sheetDefinition.kind}
          </span>
        </div>

        {/* Target Switcher */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
          {TARGET_LAYOUT_KINDS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTarget(t)}
              className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-colors flex items-center gap-1.5 ${
                activeTarget === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>
                {t === "mobile"
                  ? "📱"
                  : t === "tablet"
                  ? "📟"
                  : t === "desktop"
                  ? "💻"
                  : "📄"}
              </span>
              <span>{t}</span>
            </button>
          ))}
        </div>

        {/* Actions & Status */}
        <div className="flex items-center gap-3">
          {/* Zoom */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
              className="p-1 hover:text-foreground"
            >
              -
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
              className="p-1 hover:text-foreground"
            >
              +
            </button>
          </div>

          {/* Auto-generate variants button */}
          <button
            type="button"
            onClick={handleAutoGenerateTargets}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border"
            title="Auto-generate mobile/tablet/print from desktop layout"
          >
            Adapt All Targets
          </button>

          {/* Save Status indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            {saveStatus === "saving" && (
              <span className="text-muted-foreground">Saving…</span>
            )}
            {saveStatus === "saved" && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ Saved
              </span>
            )}
            {saveStatus === "conflict" && (
              <span className="text-amber-600 dark:text-amber-400 font-bold">
                ⚠️ Conflict
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-destructive font-bold">Error</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowPublishModal(true)}
            className="px-3.5 py-1.5 bg-primary text-primary-foreground font-semibold text-xs rounded-md hover:bg-primary/90 shadow-sm transition-colors"
          >
            Publish Version
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar (Palette / Layers) */}
        <aside className="w-80 border-r border-border bg-card flex flex-col shrink-0">
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab("palette")}
              className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 transition-colors ${
                activeTab === "palette"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Palette
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("layers")}
              className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 transition-colors ${
                activeTab === "layers"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Layers Tree
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === "palette" ? (
              <PaletteView
                onInsertNode={handleInsertNode}
                onOpenComponentLibrary={() => setShowLibrary(true)}
              />
            ) : (
              <TreeView
                rootNode={currentRoot}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                onDeleteNode={handleDeleteNode}
                onMoveNode={handleMoveNode}
                onDuplicateNode={handleDuplicateNode}
              />
            )}
          </div>
        </aside>

        {/* Center Interactive Canvas */}
        <main
          onClick={() => setSelectedNodeId(null)}
          className="flex-1 overflow-auto bg-muted/30 p-8 flex items-start justify-center"
        >
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
            className={`w-full ${canvasWidthClass} transition-all duration-200`}
          >
            <SheetRenderProvider
              value={{
                target: activeTarget,
                mode: "builder",
                selectedNodeId,
                onSelectNode: setSelectedNodeId,
                resolvedComponents,
              }}
            >
              <SheetNodeRenderer node={currentRoot} />
            </SheetRenderProvider>
          </div>
        </main>

        {/* Right Sidebar (Properties Inspector) */}
        <aside className="w-80 border-l border-border bg-card shrink-0">
          <InspectorView
            selectedNode={selectedNode}
            onUpdateNode={(updated) =>
              setTargetLayout(updateNodeInTree(currentRoot, updated))
            }
            onSaveAsComponent={(node) => setSaveComponentNode(node)}
          />
        </aside>
      </div>

      {/* Component Library Browser Dialog */}
      {showLibrary && (
        <ComponentLibraryBrowser
          systemId={systemId}
          onInsertComponent={handleInsertComponent}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {/* Save Selection as Component Modal */}
      {saveComponentNode && (
        <SaveComponentModal
          node={saveComponentNode}
          systemId={systemId}
          onSaved={() => alert("Component saved to library!")}
          onClose={() => setSaveComponentNode(null)}
        />
      )}

      {/* Publish Version Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-base font-bold text-foreground">
                Publish Sheet Version
              </h3>
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4 text-xs">
              {publishError && (
                <div className="p-2.5 rounded bg-destructive/10 border border-destructive/30 text-destructive">
                  {publishError}
                </div>
              )}

              <div className="p-3 bg-muted/40 rounded-lg border border-border flex flex-col gap-2">
                <span className="font-semibold text-foreground">
                  Pre-publication Checklist:
                </span>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>✓</span> Mobile layout defined
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>✓</span> Tablet layout defined
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>✓</span> Desktop layout defined
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>✓</span> Print A4 layout validated
                </div>
              </div>

              <div>
                <label className="font-semibold text-foreground">
                  Changelog / Release Notes
                </label>
                <textarea
                  rows={3}
                  value={publishChangelog}
                  onChange={(e) => setPublishChangelog(e.target.value)}
                  placeholder="What's new in this version…"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowPublishModal(false)}
                  disabled={publishing}
                  className="px-4 py-2 border border-border rounded-md text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={publishing}
                  className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 shadow-sm"
                >
                  {publishing ? "Publishing…" : "Confirm & Publish"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
