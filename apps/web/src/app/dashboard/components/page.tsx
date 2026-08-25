"use client";

import React, { useEffect, useState } from "react";
import type {
  ComponentScope,
  ComponentSummary,
  ListComponentsResponse,
} from "@mycharacter/contracts";
import { ComponentCard } from "@/components/sheet/library/component-card";
import { ComponentLibraryBrowser } from "@/components/sheet/library/component-library-browser";

export default function ComponentLibraryPage() {
  const [components, setComponents] = useState<ComponentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeScope, setActiveScope] = useState<ComponentScope | "all">("all");
  const [selectedComp, setSelectedComp] = useState<ComponentSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (activeScope !== "all") params.set("scope", activeScope);
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
  }, [activeScope, search]);

  return (
    <main className="max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Component Library
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Browse and share reusable sheet elements, widgets, and stat blocks.
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
          {(
            [
              { id: "all", label: "All" },
              { id: "personal", label: "My Components" },
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

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search components…"
          className="w-64 px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
          Loading library…
        </div>
      ) : components.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center border border-dashed border-border rounded-xl bg-card">
          <span className="text-3xl mb-2">🧩</span>
          <div className="text-sm font-semibold text-foreground">
            No components found
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Build and save reusable components inside the Character Sheet Builder.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {components.map((comp) => (
            <ComponentCard
              key={comp.id}
              component={comp}
              onSelect={() => setSelectedComp(comp)}
            />
          ))}
        </div>
      )}

      {selectedComp && (
        <ComponentLibraryBrowser
          onClose={() => setSelectedComp(null)}
        />
      )}
    </main>
  );
}
