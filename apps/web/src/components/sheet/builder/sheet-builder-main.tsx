"use client";

import { AgentPresence } from "@/components/agent-presence";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Download, Upload, Layers, PanelLeft, PanelRight, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  ComponentSummary,
  ComponentVersionDetails,
  LayoutNode,
  SheetEditorDataResponse,
  SheetFieldDefinition,
  TargetLayoutKind,
  TargetLayoutMap,
  SheetTransferDocument,
} from "@mycharacter/contracts";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { autosaveSheetDraftResponseSchema, sheetEditorDataResponseSchema, defaultBoxProps, MAX_SHEET_TRANSFER_BYTES, sheetTransferDocumentSchema } from "@mycharacter/contracts";
import {
  duplicateNode,
  findNode,
  findNodeAndParent,
  getAncestorIds,
  insertNode,
  moveNode,
  removeNode,
  renameNode,
} from "../../../lib/tree-utils";
import { InspectorView } from "./inspector-view";
import { createFateCorePreset, fateCoreLabelKeys, type FateCoreLabels } from "./fate-core-preset";
import { PaletteView } from "./palette-view";
import { TreeView } from "./tree-view";
import { SheetNodeRenderer } from "../renderer/sheet-node-renderer";
import { SheetRenderProvider } from "../renderer/sheet-render-context";
import { ComponentLibraryBrowser } from "../library/component-library-browser";
import { SaveComponentModal } from "../library/save-component-modal";
import { SheetViewSwitcher, type SheetViewMode } from "../sheet-view-switcher";

interface DraftSnapshot {
  layouts: TargetLayoutMap;
  fields: SheetFieldDefinition[];
}

const PRINT_CANVAS_WIDTH = 595;
const PRINT_CANVAS_HEIGHT = 874;

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
  const fateT = useTranslations("FateSheet");
  const [layouts, setLayouts] = useState<TargetLayoutMap>(
    initialData.draft.layouts,
  );
  const [draftFields, setDraftFields] = useState<SheetFieldDefinition[]>(
    initialData.draft.fields ?? [],
  );
  const [viewMode, setViewMode] = useState<SheetViewMode>("desktop");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [revision, setRevision] = useState(initialData.draft.revision);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error" | "conflict"
  >("saved");
  const [zoom, setZoom] = useState(1);
  const [fitCanvas, setFitCanvas] = useState(true);
  const [canvasSpace, setCanvasSpace] = useState(896);
  const canvasRef = useRef<HTMLElement>(null);
  const [mobilePanel, setMobilePanel] = useState<"canvas" | "layers" | "palette" | "inspector">("canvas");
  const [activeTab, setActiveTab] = useState<"layers" | "palette">("layers");
  const [showLayers, setShowLayers] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ pointerX: 0, width: 280 });

  const activeTarget: TargetLayoutKind =
    viewMode === "mobile"
      ? "mobile"
      : viewMode === "print"
        ? "print"
        : "desktop";

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
  const [history, setHistory] = useState<DraftSnapshot[]>([]);
  const [future, setFuture] = useState<DraftSnapshot[]>([]);

  // Modals
  const [showAdaptModal, setShowAdaptModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [saveComponentNode, setSaveComponentNode] = useState<LayoutNode | null>(
    null,
  );
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishChangelog, setPublishChangelog] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishSucceeded, setPublishSucceeded] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<SheetTransferDocument | null>(null);
  const [importSucceeded, setImportSucceeded] = useState(false);

  // Resolved component versions initialized from server response
  const [resolvedComponents, setResolvedComponents] = useState<
    Map<string, ComponentVersionDetails>
  >(() => {
    const map = new Map<string, ComponentVersionDetails>();
    if (initialData.resolvedComponents) {
      for (const [id, details] of Object.entries(
        initialData.resolvedComponents,
      )) {
        map.set(id, details);
      }
    }
    return map;
  });

  const currentRoot = layouts[activeTarget];

  // Layout and field definitions belong to the same undoable draft.
  const recordHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-19), { layouts, fields: draftFields }]);
    setFuture([]);
    setSaveStatus("idle");
  }, [layouts, draftFields]);

  const setTargetLayout = useCallback(
    (newRoot: LayoutNode) => {
      if (newRoot === layouts[activeTarget]) return;
      recordHistory();
      setLayouts({ ...layouts, [activeTarget]: newRoot });
    },
    [activeTarget, layouts, recordHistory],
  );

  const undo = useCallback(() => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [{ layouts, fields: draftFields }, ...f]);
    setLayouts(previous.layouts);
    setDraftFields(previous.fields);
    setSaveStatus("idle");
  }, [history, layouts, draftFields]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h.slice(-19), { layouts, fields: draftFields }]);
    setLayouts(next.layouts);
    setDraftFields(next.fields);
    setSaveStatus("idle");
  }, [future, layouts, draftFields]);

  // Keyboard shortcuts (Cmd+Z, Cmd+Shift+Z, Ctrl+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
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
      if (id) { setMobilePanel("inspector"); setShowInspector(true); }
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
    const selected = selectedNodeId
      ? findNodeAndParent(currentRoot, selectedNodeId)
      : null;
    const parent = selected?.node?.kind === "frame"
      ? selected.node
      : selected?.parent?.kind === "frame"
        ? selected.parent
        : currentRoot.kind === "frame" ? currentRoot : null;
    if (!parent) return;
    const index = selected?.parent?.id === parent.id ? selected.index + 1 : undefined;
    setTargetLayout(insertNode(currentRoot, parent.id, newNode, index));
    setSelectedNodeId(newNode.id);
    setExpandedNodesByTarget((prev) => ({
      ...prev,
      [activeTarget]: new Set([...prev[activeTarget], ...getAncestorIds(currentRoot, parent.id), parent.id]),
    }));
    setMobilePanel("inspector");
    setShowInspector(true);
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
    setShowAdaptModal(false);

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

    recordHistory();
    setLayouts({
      desktop: desktopRoot,
      mobile: adaptForMobile(desktopRoot),
      tablet: JSON.parse(JSON.stringify(desktopRoot)),
      print: JSON.parse(JSON.stringify(desktopRoot)),
    });
    setSaveStatus("idle");
  };

  // Autosave is serialized so a second edit cannot race the revision returned
  // by the request that is already in flight.
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const revisionRef = useRef(revision);
  const latestDraftRef = useRef({ layouts, fields: draftFields });
  const observedDraftRef = useRef({ layouts, fields: draftFields });

  useEffect(() => {
    latestDraftRef.current = { layouts, fields: draftFields };
  }, [layouts, draftFields]);

  const flushAutosave = useCallback(async () => {
    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
    pendingSaveRef.current = false;
    setSaveStatus("saving");
    const draft = latestDraftRef.current;

    try {
      const data = autosaveSheetDraftResponseSchema.parse(await apiFetch<unknown>(
        `/api/sheet-definitions/${initialData.sheetDefinition.id}/draft`,
        {
          method: "PUT",
          body: JSON.stringify({
            expectedRevision: revisionRef.current,
            layouts: draft.layouts,
            fields: draft.fields,
          }),
        },
      ));

      revisionRef.current = data.revision;
      setRevision(data.revision);
      if (!pendingSaveRef.current) setSaveStatus("saved");
    } catch (error: unknown) {
      pendingSaveRef.current = false;
      setSaveStatus(error instanceof ApiClientError && error.status === 409 ? "conflict" : "error");
    } finally {
      saveInFlightRef.current = false;
      if (pendingSaveRef.current) {
        autosaveTimerRef.current = setTimeout(() => {
          void flushAutosave();
        }, 150);
      }
    }
  }, [initialData.sheetDefinition.id]);

  useEffect(() => {
    const observed = observedDraftRef.current;
    if (observed.layouts === layouts && observed.fields === draftFields) {
      return;
    }
    observedDraftRef.current = { layouts, fields: draftFields };

    pendingSaveRef.current = true;
    setSaveStatus("idle");
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    if (saveInFlightRef.current) return;
    autosaveTimerRef.current = setTimeout(() => {
      void flushAutosave();
    }, 500);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [layouts, draftFields, flushAutosave]);

  useEffect(() => {
    if (saveStatus === "saved") return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [saveStatus]);

  const syncAgentDraft = async (signal: AbortSignal) => {
    if (saveStatus !== "saved" || pendingSaveRef.current || saveInFlightRef.current) return;
    const before = latestDraftRef.current;
    const data = sheetEditorDataResponseSchema.parse(await apiFetch<unknown>(
      `/api/sheet-definitions/${initialData.sheetDefinition.id}/editor`, { signal },
    ));
    if (signal.aborted || pendingSaveRef.current || saveInFlightRef.current || latestDraftRef.current !== before || data.draft.revision <= revisionRef.current) return;
    const next = { layouts: data.draft.layouts, fields: data.draft.fields };
    // A remote draft must not trigger a new autosave or overwrite local edits.
    observedDraftRef.current = next;
    latestDraftRef.current = next;
    revisionRef.current = data.draft.revision;
    setLayouts(next.layouts);
    setDraftFields(next.fields);
    setRevision(data.draft.revision);
    setResolvedComponents(new Map(Object.entries(data.resolvedComponents)));
    setHistory([]);
    setFuture([]);
  };

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
    if (saveStatus !== "saved" || pendingSaveRef.current || saveInFlightRef.current) return;
    setPublishing(true);
    setPublishError(null);
    setPublishSucceeded(false);
    try {
      await apiFetch(
        `/api/sheet-definitions/${initialData.sheetDefinition.id}/publish`,
        {
          method: "POST",
          body: JSON.stringify({ changelog: publishChangelog || t("defaultChangelog") }),
        },
      );

      setShowPublishModal(false);
      setPublishSucceeded(true);
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : t("publishFailed"));
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

  const canvasWidth = {
    mobile: 384,
    tablet: 672,
    desktop: 896,
    print: PRINT_CANVAS_WIDTH,
  }[activeTarget];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setCanvasSpace(entry.contentRect.width);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const effectiveZoom = fitCanvas ? Math.min(1, canvasSpace / canvasWidth) : zoom;
  const exportSheet = async () => {
    setTransferBusy(true);
    setTransferError(null);
    try {
      const document = sheetTransferDocumentSchema.parse(await apiFetch<unknown>(`/api/sheet-definitions/${initialData.sheetDefinition.id}/export`));
      const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${initialData.sheetDefinition.slug || "character-sheet"}.mycharacter.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setTransferError(t("exportFailed"));
    } finally {
      setTransferBusy(false);
    }
  };

  const readImport = async (file: File) => {
    setTransferBusy(true);
    setTransferError(null);
    setImportSucceeded(false);
    try {
      if (file.size > MAX_SHEET_TRANSFER_BYTES) throw new Error("File too large");
      const parsed = sheetTransferDocumentSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error("Invalid document");
      setPendingImport(parsed.data);
    } catch {
      setTransferError(t("invalidImport"));
    } finally {
      setTransferBusy(false);
    }
  };

  const applyImport = () => {
    if (!pendingImport) return;
    recordHistory();
    setLayouts(pendingImport.layouts);
    setDraftFields(pendingImport.fields);
    setSelectedNodeId(null);
    setExpandedNodesByTarget(Object.fromEntries(Object.entries(pendingImport.layouts).map(([target, root]) => [target, new Set([root.id])])) as Record<TargetLayoutKind, Set<string>>);
    setPendingImport(null);
    setImportSucceeded(true);
  };

  const canPublish = saveStatus === "saved" && !publishing;
  const selectedInfo = selectedNodeId ? findNodeAndParent(currentRoot, selectedNodeId) : null;
  const canModifySelected = selectedInfo?.parent?.kind === "frame";

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] min-h-0 w-full bg-background overflow-hidden">
      {/* Top Action Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-card">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
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
        <SheetViewSwitcher
          value={viewMode}
          onChange={(mode) => { setViewMode(mode); setSelectedNodeId(null); setMobilePanel("canvas"); }}
          adaptiveLabel={t("targetAdaptive")}
          mobileLabel={t("targetMobile")}
          desktopLabel={t("targetDesktop")}
          printLabel={t("targetPrint")}
          kind="builder"
        />

        {/* Actions & Status */}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="hidden items-center gap-1 lg:flex">
            <button type="button" aria-label={t("layers")} title={t("layers")} aria-pressed={showLayers} onClick={() => setShowLayers((visible) => !visible)} className="rounded p-2 hover:bg-muted"><PanelLeft className="size-4" /></button>
            <button type="button" aria-label={t("inspector")} title={t("inspector")} aria-pressed={showInspector} onClick={() => setShowInspector((visible) => !visible)} className="rounded p-2 hover:bg-muted"><PanelRight className="size-4" /></button>
          </div>
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
              onClick={() => { setFitCanvas(false); setZoom(Math.max(0.2, effectiveZoom - 0.1)); }}
              className="p-1 hover:text-foreground"
              aria-label={t("zoomOut")}
            >
              -
            </button>
            <span>{Math.round(effectiveZoom * 100)}%</span>
            <button
              type="button"
              onClick={() => { setFitCanvas(false); setZoom(Math.min(1.5, effectiveZoom + 0.1)); }}
              className="p-1 hover:text-foreground"
              aria-label={t("zoomIn")}
            >
              +
            </button>
          </div>

          <button type="button" onClick={() => setFitCanvas(true)} aria-pressed={fitCanvas} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">{t("fitCanvas")}</button>

          {/* Auto-generate variants button */}
          <button
            type="button"
            onClick={() => setShowAdaptModal(true)}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border"
            title={t("adaptTargetsHint")}
          >
            {t("adaptTargets")}
          </button>

          <button type="button" onClick={() => void exportSheet()} disabled={saveStatus !== "saved" || transferBusy} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-50">
            <Download className="size-3.5" />{t("exportJson")}
          </button>
          <button type="button" onClick={() => importFileRef.current?.click()} disabled={transferBusy || !initialData.isOwner} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-50">
            <Upload className="size-3.5" />{t("importJson")}
          </button>
          <input ref={importFileRef} type="file" accept=".json,application/json" className="sr-only" aria-label={t("importFile")} onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void readImport(file);
          }} />

          {/* Save Status indicator */}
          <div role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs">
            {saveStatus === "idle" && <span className="text-muted-foreground">{t("unsaved")}</span>}
            {saveStatus === "error" && <button type="button" className="underline" onClick={() => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); void flushAutosave(); }}>{t("retrySave")}</button>}
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
            disabled={!canPublish}
            title={!canPublish ? t("publishAfterSave") : undefined}
            className="px-3.5 py-1.5 bg-primary text-primary-foreground font-semibold text-xs rounded-md hover:bg-primary/90 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("publish")}
          </button>
        </div>
      </header>

      {transferError && <p role="alert" className="border-b border-border px-4 py-2 text-sm text-destructive">{transferError}</p>}
      {importSucceeded && <p role="status" className="border-b border-border px-4 py-2 text-sm text-primary">{t("importSucceeded")}</p>}
      {pendingImport && (
        <div role="dialog" aria-modal="true" aria-labelledby="sheet-import-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <h3 id="sheet-import-title" className="font-semibold">{t("confirmImport")}</h3>
            <p className="mt-3 text-sm">{t("importSummary", { title: pendingImport.title, count: pendingImport.fields.length })}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("importReplaceWarning")}</p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setPendingImport(null)} className="rounded border border-border px-3 py-2 text-sm">{t("cancel")}</button>
              <button type="button" onClick={applyImport} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">{t("applyImport")}</button>
            </div>
          </div>
        </div>
      )}

      {publishSucceeded && <p role="status" className="border-b border-border bg-card px-4 py-2 text-sm text-primary">{t("publishSucceeded")}</p>}

      <nav aria-label={t("panels")} className="flex shrink-0 overflow-x-auto border-b border-border bg-card lg:hidden">
        {(["canvas", "layers", "palette", "inspector"] as const).map((panel) => (
          <button key={panel} type="button" aria-pressed={mobilePanel === panel} onClick={() => { setMobilePanel(panel); if (panel === "layers" || panel === "palette") setActiveTab(panel); }} className={`flex-1 whitespace-nowrap px-3 py-3 text-xs font-semibold ${mobilePanel === panel ? "bg-muted text-primary" : "text-muted-foreground"}`}>
            {t(panel)}
          </button>
        ))}
      </nav>

      {/* Main Workspace Layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Sidebar (Layers / Add Elements) */}
        <aside
          style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
          className={`${mobilePanel === "layers" || mobilePanel === "palette" ? "flex" : "hidden"} w-full min-h-0 border-r border-border bg-card flex-col shrink-0 relative ${showLayers ? "lg:flex" : "lg:hidden"} lg:w-[var(--sidebar-width)]`}
        >
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => { setActiveTab("layers"); setMobilePanel("layers"); }}
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
              onClick={() => { setActiveTab("palette"); setMobilePanel("palette"); }}
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
            className="absolute hidden lg:block top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary z-20"
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
          ref={canvasRef}
          className={`${mobilePanel === "canvas" ? "block" : "hidden"} min-w-0 flex-1 bg-muted/30 p-4 overflow-auto relative lg:block lg:p-6`}
          onClick={() => setSelectedNodeId(null)}
        >
          {currentRoot.kind === "frame" && currentRoot.children.length === 0 && (
            <div className="mx-auto mb-6 max-w-md rounded-[var(--radius-card)] border border-dashed border-border bg-card p-6 text-center" onClick={(event) => event.stopPropagation()}>
              <Layers className="mx-auto mb-3 size-6 text-muted-foreground" />
              <h3 className="text-base font-semibold">{t("emptySheetTitle")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t("emptySheetHint")}</p>
              {draftFields.length === 0 &&
                Object.values(layouts).every(root => root.kind === "frame" && root.children.length === 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      const labels = Object.fromEntries(
                        fateCoreLabelKeys.map(key => [key, fateT(key)]),
                      ) as FateCoreLabels;
                      const preset = createFateCorePreset(labels);
                      recordHistory();
                      setLayouts(preset.layouts);
                      setDraftFields(preset.fields);
                      setSelectedNodeId(null);
                    }}
                    className="mt-4 mr-2 rounded-[var(--radius-control)] border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    {fateT("usePreset")}
                  </button>
                )}
              <button type="button" onClick={() => { setActiveTab("palette"); setMobilePanel("palette"); setShowLayers(true); }} className="mt-4 rounded-[var(--radius-control)] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{t("startBuilding")}</button>
            </div>
          )}
          <div className="mx-auto w-fit">
            <div
              data-sheet-page
              data-sheet-target={activeTarget}
              style={{
                width: canvasWidth,
                height: activeTarget === "print" ? currentRoot.box.height.mode === "fixed" ? currentRoot.box.height.value : PRINT_CANVAS_HEIGHT : undefined,
                zoom: effectiveZoom,
              }}
              className={activeTarget === "print" ? "relative bg-white text-black shadow-2xl" : "relative"}
            >
              <AgentPresence resourceType="sheet" resourceId={initialData.sheetDefinition.id} target={activeTarget} onSync={syncAgentDraft} />
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
          </div>
        </main>

        {/* Right Sidebar (Property Inspector) */}
        <aside className={`${mobilePanel === "inspector" ? "flex" : "hidden"} w-full min-h-0 border-l border-border bg-card flex-col shrink-0 ${showInspector ? "lg:flex" : "lg:hidden"} lg:w-72 xl:w-80`}>
          <header className="p-3 border-b border-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("inspector")}
            </h3>
          </header>
          {selectedNode && <div className="flex items-center gap-2 border-b border-border p-3">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{selectedNode.name || t(`nodeKind.${selectedNode.kind}`)}</span>
            <button type="button" aria-label={t("duplicate")} title={t("duplicate")} disabled={!canModifySelected} onClick={() => handleDuplicateNode(selectedNode.id)} className="rounded p-2 hover:bg-muted disabled:opacity-30"><Copy className="size-4" /></button>
            <button type="button" aria-label={t("delete")} title={t("delete")} disabled={!canModifySelected} onClick={() => handleDeleteNode(selectedNode.id)} className="rounded p-2 text-destructive hover:bg-muted disabled:opacity-30"><Trash2 className="size-4" /></button>
          </div>}
          <InspectorView
            selectedNode={selectedNode}
            onUpdateNode={(updated) => {
              setTargetLayout(updateNodeInTree(currentRoot, updated));
            }}
            onSaveAsComponent={(node) => setSaveComponentNode(node)}
            draftFields={draftFields}
            onUpdateDraftFields={(fields, updatedNode) => {
              recordHistory();
              setDraftFields(fields);
              if (updatedNode) setLayouts({ ...layouts, [activeTarget]: updateNodeInTree(currentRoot, updatedNode) });
            }}
          />
        </aside>
      </div>

      {showAdaptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="adapt-title" aria-describedby="adapt-description" className="w-full max-w-md rounded-[var(--radius-card)] border border-border bg-background p-6 shadow-2xl" onKeyDown={(event) => { if (event.key === "Escape") setShowAdaptModal(false); }}>
            <h3 id="adapt-title" className="text-lg font-bold">{t("adaptTargets")}</h3>
            <p id="adapt-description" className="mt-2 text-sm text-muted-foreground">{t("adaptConfirm")}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button autoFocus type="button" onClick={() => setShowAdaptModal(false)} className="rounded border border-border px-4 py-2 text-sm hover:bg-muted">{t("cancel")}</button>
              <button type="button" onClick={handleAutoGenerateTargets} className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{t("adaptTargets")}</button>
            </div>
          </div>
        </div>
      )}

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
                disabled={!canPublish}
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
