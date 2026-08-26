"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Layers,
  Monitor,
  Plus,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  ComponentSummary,
  ComponentVersionDetails,
  LayoutNode,
  SheetEditorDataResponse,
  SheetFieldDefinition,
  TargetLayoutKind,
  TargetLayoutMap,
} from "@mycharacter/contracts";
import { defaultBoxProps } from "@mycharacter/contracts";
import {
  duplicateNode,
  findNode,
  getAncestorIds,
  insertNode,
  moveNode,
  removeNode,
  renameNode,
} from "../../../lib/tree-utils";
import { InspectorView } from "./inspector-view";
import { PaletteView } from "./palette-view";
import { TreeView } from "./tree-view";
import { SheetNodeRenderer } from "../renderer/sheet-node-renderer";
import { SheetRenderProvider } from "../renderer/sheet-render-context";
import { ComponentLibraryBrowser } from "../library/component-library-browser";
import { SaveComponentModal } from "../library/save-component-modal";

interface SheetBuilderMainProps {
  initialData: SheetEditorDataResponse;
  systemId: string;
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

export const SheetBuilderMain: React.FC<SheetBuilderMainProps> = ({
  initialData,
  systemId,
}) => {
  const t = useTranslations("SheetBuilder");
  const [layouts, setLayouts] = useState<TargetLayoutMap>(
    initialData.draft.layouts,
  );
  const [draftFields, setDraftFields] = useState<SheetFieldDefinition[]>(
    initialData.draft.fields ?? [],
  );
  const [activeTarget, setActiveTarget] = useState<TargetLayoutKind>("desktop");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [revision, setRevision] = useState(initialData.draft.revision);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error" | "conflict"
  >("saved");
  const [zoom, setZoom] = useState(1);
  const [activeTab, setActiveTab] = useState<"layers" | "palette">("layers");
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ pointerX: 0, width: 280 });

  // Expansion state per target layout (non-persistent, does not trigger autosave)
  const [expandedNodesByTarget, setExpandedNodesByTarget] = useState<
    Record<TargetLayoutKind, Set<string>>
  >({
    mobile: new Set([initialData.draft.layouts.mobile.id]),
    tablet: new Set([initialData.draft.layouts.tablet.id]),
    desktop: new Set([initialData.draft.layouts.desktop.id]),
    print: new Set([initialData.draft.layouts.print.id]),
  });

  // Undo / Redo history
  const [history, setHistory] = useState<TargetLayoutMap[]>([]);
  const [future, setFuture] = useState<TargetLayoutMap[]>([]);

  // Modals
  const [showLibrary, setShowLibrary] = useState(false);
  const [saveComponentNode, setSaveComponentNode] = useState<LayoutNode | null>(
    null,
  );
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishChangelog, setPublishChangelog] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Resolved component versions initialized from server response
  const [resolvedComponents, setResolvedComponents] = useState<
    Map<string, ComponentVersionDetails>
  >(() => {
    const map = new Map<string, ComponentVersionDetails>();
    if (initialData.resolvedComponents) {
      for (const [id, details] of Object.entries(initialData.resolvedComponents)) {
        map.set(id, details);
      }
    }
    return map;
  });

  const currentRoot = layouts[activeTarget];

  // Record history and update layout
  const setTargetLayout = useCallback(
    (newRoot: LayoutNode) => {
      setLayouts((prev) => {
        setHistory((h) => [...h.slice(-20), prev]);
        setFuture([]);
        return { ...prev, [activeTarget]: newRoot };
      });
      setSaveStatus("idle");
    },
    [activeTarget],
  );

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const prevLayouts = history[history.length - 1];
    if (!prevLayouts) return;
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [layouts, ...f]);
    setLayouts(prevLayouts);
    setSaveStatus("idle");
  }, [history, layouts]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const nextLayouts = future[0];
    if (!nextLayouts) return;
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, layouts]);
    setLayouts(nextLayouts);
    setSaveStatus("idle");
  }, [future, layouts]);

  // Keyboard shortcuts (Cmd+Z, Cmd+Shift+Z, Ctrl+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement &&
          (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") ||
        ((e.metaKey || e.ctrlKey) && e.key === "y")
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // Selection synchronization with tree expansion
  const selectNode = useCallback(
    (id: string | null) => {
      setSelectedNodeId(id);
      if (id) {
        const ancestors = getAncestorIds(currentRoot, id);
        if (ancestors.length > 0) {
          setExpandedNodesByTarget((prev) => {
            const set = new Set(prev[activeTarget]);
            ancestors.forEach((ancId) => set.add(ancId));
            return { ...prev, [activeTarget]: set };
          });
        }
      }
    },
    [currentRoot, activeTarget],
  );

  const toggleExpand = useCallback(
    (id: string) => {
      setExpandedNodesByTarget((prev) => {
        const set = new Set(prev[activeTarget]);
        if (set.has(id)) {
          set.delete(id);
        } else {
          set.add(id);
        }
        return { ...prev, [activeTarget]: set };
      });
    },
    [activeTarget],
  );

  const selectedNode = selectedNodeId
    ? findNode(currentRoot, selectedNodeId)
    : null;

  // Insert node
  const handleInsertNode = (newNode: LayoutNode) => {
    if (selectedNode && selectedNode.kind === "frame") {
      const updated = insertNode(currentRoot, selectedNode.id, newNode);
      setTargetLayout(updated);
    } else if (currentRoot.kind === "frame") {
      const updated = insertNode(currentRoot, currentRoot.id, newNode);
      setTargetLayout(updated);
    }
    selectNode(newNode.id);
  };

  // Delete node
  const handleDeleteNode = (id: string) => {
    if (id === currentRoot.id) return;
    setTargetLayout(removeNode(currentRoot, id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  // Duplicate node
  const handleDuplicateNode = (id: string) => {
    if (id === currentRoot.id) return;
    const { updatedRoot, newId } = duplicateNode(currentRoot, id);
    setTargetLayout(updatedRoot);
    if (newId) selectNode(newId);
  };

  // Rename node
  const handleRenameNode = (id: string, name: string) => {
    setTargetLayout(renameNode(currentRoot, id, name));
  };

  // Drag & drop hierarchy movement
  const handleMoveNodeHierarchy = (
    draggedId: string,
    targetId: string,
    position: "before" | "inside" | "after",
  ) => {
    const updated = moveNode(currentRoot, draggedId, targetId, position);
    setTargetLayout(updated);
    selectNode(draggedId);
  };

  // Auto-generate mobile/tablet/print from desktop layout
  const handleAutoGenerateTargets = () => {
    if (!confirm(t("adaptTargets") + "?")) {
      return;
    }

    const desktopRoot = layouts.desktop;

    const adaptForMobile = (node: LayoutNode): LayoutNode => {
      const clone = JSON.parse(JSON.stringify(node)) as LayoutNode;
      const transform = (n: LayoutNode) => {
        if (n.kind === "frame") {
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

  // Autosave mechanism
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (saveStatus !== "idle") return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    autosaveTimerRef.current = setTimeout(async () => {
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
              fields: draftFields,
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
    }, 1500);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [layouts, draftFields, revision, saveStatus, initialData.sheetDefinition.id]);

  // Insert component instance from library
  const handleInsertComponent = (
    summary: ComponentSummary,
    version: ComponentVersionDetails,
  ) => {
    setResolvedComponents((prev) => {
      const next = new Map(prev);
      next.set(version.id, version);
      return next;
    });

    const instanceNode: LayoutNode = {
      id: crypto.randomUUID(),
      kind: "component-instance",
      name: summary.name,
      componentId: summary.id,
      componentVersionId: version.id,
      propertyOverrides: {},
      box: { ...defaultBoxProps },
    };

    handleInsertNode(instanceNode);
    setShowLibrary(false);
  };

  // Publish sheet version
  const handlePublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(
        `/api/sheet-definitions/${initialData.sheetDefinition.id}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            changelog: publishChangelog || t("defaultChangelog"),
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t("publishFailed"));
      }

      setShowPublishModal(false);
      alert(t("publishSucceeded"));
      window.location.reload();
    } catch (err: unknown) {
      setPublishError(
        err instanceof Error ? err.message : t("publishFailed"),
      );
    } finally {
      setPublishing(false);
    }
  };

  // Sidebar resize handlers
  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isResizingRef.current = true;
    resizeStartRef.current = { pointerX: e.clientX, width: sidebarWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizingRef.current) return;
    const delta = e.clientX - resizeStartRef.current.pointerX;
    const newWidth = Math.max(
      220,
      Math.min(480, resizeStartRef.current.width + delta),
    );
    setSidebarWidth(newWidth);
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isResizingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleResizeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const delta = e.key === "ArrowLeft" ? -10 : 10;
    setSidebarWidth((width) => Math.max(220, Math.min(480, width + delta)));
  };

  const canvasSizeClass = {
    mobile: "max-w-sm",
    tablet: "max-w-2xl",
    desktop: "max-w-4xl",
    print: "w-[794px] h-[1123px] max-w-none flex-none bg-white text-black shadow-2xl print-page",
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
            <span>←</span> {t("workspace")}
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
          <button
            type="button"
            onClick={() => setActiveTarget("mobile")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              activeTarget === "mobile"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Smartphone className="size-3.5" />
            <span>{t("targetMobile")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTarget("tablet")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              activeTarget === "tablet"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Tablet className="size-3.5" />
            <span>{t("targetTablet")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTarget("desktop")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              activeTarget === "desktop"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Monitor className="size-3.5" />
            <span>{t("targetDesktop")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTarget("print")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              activeTarget === "print"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="size-3.5" />
            <span>{t("targetPrint")}</span>
          </button>
        </div>

        {/* Actions & Status */}
        <div className="flex items-center gap-3">
          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 border border-border rounded p-0.5">
            <button
              type="button"
              onClick={undo}
              disabled={history.length === 0}
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded"
              title={`${t("undo")} (Cmd+Z)`}
              aria-label={t("undo")}
            >
              <Undo2 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={future.length === 0}
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded"
              title={`${t("redo")} (Cmd+Shift+Z)`}
              aria-label={t("redo")}
            >
              <Redo2 className="size-3.5" />
            </button>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
              className="p-1 hover:text-foreground"
              aria-label={t("zoomOut")}
            >
              -
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
              className="p-1 hover:text-foreground"
              aria-label={t("zoomIn")}
            >
              +
            </button>
          </div>

          {/* Auto-generate variants button */}
          <button
            type="button"
            onClick={handleAutoGenerateTargets}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border"
            title={t("adaptTargetsHint")}
          >
            {t("adaptTargets")}
          </button>

          {/* Save Status indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            {saveStatus === "saving" && (
              <span className="text-muted-foreground">{t("saving")}</span>
            )}
            {saveStatus === "saved" && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ {t("saved")}
              </span>
            )}
            {saveStatus === "conflict" && (
              <span className="text-amber-600 dark:text-amber-400 font-bold">
                ⚠️ {t("conflict")}
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-destructive font-bold">{t("error")}</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowPublishModal(true)}
            className="px-3.5 py-1.5 bg-primary text-primary-foreground font-semibold text-xs rounded-md hover:bg-primary/90 shadow-sm transition-colors"
          >
            {t("publish")}
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar (Layers / Add Elements) */}
        <aside
          style={{ width: `${sidebarWidth}px` }}
          className="border-r border-border bg-card flex flex-col shrink-0 relative"
        >
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab("layers")}
              className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === "layers"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="size-3.5" />
              <span>{t("layers")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("palette")}
              className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === "palette"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Plus className="size-3.5" />
              <span>{t("palette")}</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === "layers" ? (
              <TreeView
                rootNode={currentRoot}
                selectedNodeId={selectedNodeId}
                expandedNodeIds={expandedNodesByTarget[activeTarget]}
                onToggleExpand={toggleExpand}
                onSelectNode={selectNode}
                onDeleteNode={handleDeleteNode}
                onDuplicateNode={handleDuplicateNode}
                onRenameNode={handleRenameNode}
                onMoveNodeHierarchy={handleMoveNodeHierarchy}
              />
            ) : (
              <PaletteView
                onInsertNode={handleInsertNode}
                onOpenComponentLibrary={() => setShowLibrary(true)}
              />
            )}
          </div>

          {/* Drag Resize Handle */}
          <div
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onKeyDown={handleResizeKeyDown}
            className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary z-20"
            title={t("resizePanel")}
            aria-label={t("resizePanel")}
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={220}
            aria-valuemax={480}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
          />
        </aside>

        {/* Central Visual Canvas */}
        <main
          className="flex-1 bg-muted/30 p-8 overflow-auto flex items-start justify-center relative"
          onClick={() => setSelectedNodeId(null)}
        >
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
              transition: "transform 0.1s ease-out",
            }}
            className={`${activeTarget === "print" ? "" : "w-full"} ${canvasSizeClass} transition-all duration-200`}
          >
            <SheetRenderProvider
              value={{
                mode: "builder",
                target: activeTarget,
                selectedNodeId,
                onSelectNode: selectNode,
                resolvedComponents,
              }}
            >
              <SheetNodeRenderer node={currentRoot} />
            </SheetRenderProvider>
          </div>
        </main>

        {/* Right Sidebar (Property Inspector) */}
        <aside className="w-80 border-l border-border bg-card flex flex-col shrink-0">
          <header className="p-3 border-b border-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("inspector")}
            </h3>
          </header>
          <InspectorView
            systemId={systemId}
            selectedNode={selectedNode}
            onUpdateNode={(updated) => {
              setTargetLayout(updateNodeInTree(currentRoot, updated));
            }}
            onSaveAsComponent={(node) => setSaveComponentNode(node)}
            draftFields={draftFields}
            onUpdateDraftFields={(fields) => {
              setDraftFields(fields);
              setSaveStatus("idle");
            }}
          />
        </aside>
      </div>

      {/* Component Library Modal */}
      {showLibrary && (
        <ComponentLibraryBrowser
          systemId={systemId}
          onInsertComponent={handleInsertComponent}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {/* Save as Component Modal */}
      {saveComponentNode && (
        <SaveComponentModal
          systemId={systemId}
          node={saveComponentNode}
          onClose={() => setSaveComponentNode(null)}
          onSaved={() => setSaveComponentNode(null)}
        />
      )}

      {/* Publish Version Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground">
              {t("publishModalTitle")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("publishModalDescription")}
            </p>

            {publishError && (
              <div className="mt-3 p-3 bg-destructive/10 border border-destructive text-destructive text-xs rounded">
                {publishError}
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs font-semibold text-foreground">
                {t("changelogLabel")}
              </label>
              <textarea
                rows={3}
                value={publishChangelog}
                onChange={(e) => setPublishChangelog(e.target.value)}
                placeholder={t("changelogPlaceholder")}
                className="w-full mt-1.5 p-2 bg-background border border-border rounded text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                disabled={publishing}
                className="px-4 py-2 text-xs font-semibold rounded border border-border hover:bg-muted"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="px-4 py-2 text-xs font-semibold rounded bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                {publishing ? t("publishing") : t("confirmPublish")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
