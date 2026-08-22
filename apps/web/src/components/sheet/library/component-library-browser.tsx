"use client";

import React, { useEffect, useState } from "react";
import type {
  ComponentScope,
  ComponentSummary,
  ComponentVersionDetails,
  ListComponentsResponse,
} from "@mycharacter/contracts";
import { ComponentCard } from "./component-card.js";

interface ComponentLibraryBrowserProps {
  systemId?: string;
  onInsertComponent?: (
    component: ComponentSummary,
    version: ComponentVersionDetails,
  ) => void;
  onClose?: () => void;
}

export const ComponentLibraryBrowser: React.FC<ComponentLibraryBrowserProps> = ({
  systemId,
  onInsertComponent,
  onClose,
}) => {
  const [activeScope, setActiveScope] = useState<ComponentScope | "all">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [components, setComponents] = useState<ComponentSummary[]>([]);
  const [selectedComp, setSelectedComp] = useState<ComponentSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (activeScope !== "all") params.set("scope", activeScope);
        if (activeScope === "system" && systemId) params.set("systemId", systemId);
        if (search.trim()) params.set("search", search.trim());

        const res = await fetch(`/api/components?${params.toString()}`);
        if (res.ok) {
          const data: ListComponentsResponse = await res.json();
          if (!cancelled) {
            setComponents(data.components);
          }
        }
      } catch (err) {
        console.error("Failed to load components", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeScope, search, systemId]);

  const handleSelect = (comp: ComponentSummary) => {
    setSelectedComp(comp);
  };

  const handleInsert = async (comp: ComponentSummary) => {
    if (!onInsertComponent) return;
    if (!comp.currentVersionId) {
      alert("This component has not published any versions yet.");
      return;
    }
    try {
      const res = await fetch(`/api/components/versions/${comp.currentVersionId}`);
      if (res.ok) {
        const versionData: ComponentVersionDetails = await res.json();
        onInsertComponent(comp, versionData);
        onClose?.();
      }
    } catch (err) {
      console.error("Failed to insert component", err);
    }
  };

  const handleFork = async (comp: ComponentSummary) => {
    try {
      const res = await fetch(`/api/components/${comp.id}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${comp.name} (Fork)`,
          scope: "personal",
        }),
      });
      if (res.ok) {
        const forked: ComponentSummary = await res.json();
        alert(`Forked "${forked.name}" successfully!`);
        setActiveScope("personal");
      }
    } catch (err) {
      console.error("Failed to fork component", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex flex-col bg-background border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-lg font-bold text-foreground">
              Component Library
            </h3>
            <p className="text-xs text-muted-foreground">
              Reuse, share, and customize modular character sheet components
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-lg p-1 rounded-md"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-muted/20 border-b border-border">
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
            {(
              [
                { id: "all", label: "All" },
                { id: "personal", label: "My Components" },
                ...(systemId ? [{ id: "system", label: "System" }] : []),
                { id: "public", label: "Community" },
                { id: "curated", label: "Curated" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveScope(tab.id as ComponentScope | "all")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeScope === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-64">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search components…"
              className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Content Grid */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
              Loading components…
            </div>
          ) : components.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <span className="text-3xl mb-2">🧩</span>
              <div className="text-sm font-semibold text-foreground">
                No components found
              </div>
              <div className="text-xs text-muted-foreground max-w-sm mt-1">
                Save any element or frame from your sheet builder as a reusable component.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {components.map((comp) => (
                <ComponentCard
                  key={comp.id}
                  component={comp}
                  onSelect={() => handleSelect(comp)}
                  onInsert={() => handleInsert(comp)}
                  onFork={() => handleFork(comp)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Component Detail Drawer / Footer */}
        {selectedComp && (
          <div className="flex items-center justify-between px-6 py-3 bg-muted/40 border-t border-border">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-foreground">
                {selectedComp.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {selectedComp.currentVersionNumber
                  ? `v${selectedComp.currentVersionNumber}`
                  : "Draft"}
              </span>
              {selectedComp.author && (
                <span className="text-xs text-muted-foreground">
                  by @{selectedComp.author.username}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedComp(null)}
                className="px-3 py-1 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground"
              >
                Close Details
              </button>
              <button
                type="button"
                onClick={() => handleInsert(selectedComp)}
                className="px-4 py-1 text-xs bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 shadow-sm"
              >
                Insert Component
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
