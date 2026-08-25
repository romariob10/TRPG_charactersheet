"use client";

import React, { use, useState } from "react";
import { useRouter } from "next/navigation";
import type { SheetKind } from "@mycharacter/contracts";

export default function NewSheetDefinitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: systemId } = use(params);
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<SheetKind>("character");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/sheet-definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemId,
          title: title.trim(),
          description: description.trim(),
          kind,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || "Failed to create sheet.");
      }

      const created = await res.json();
      router.push(`/dashboard/systems/${systemId}/sheets/${created.id}/builder`);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
      setLoading(false);
    }
  };

  return (
    <main className="max-w-xl mx-auto py-12 px-4">
      <div className="bg-card border border-border rounded-xl shadow-lg p-6">
        <a
          href={`/dashboard/systems/${systemId}/workspace`}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground mb-4 inline-block"
        >
          ← Back to System Workspace
        </a>

        <h1 className="text-xl font-bold text-foreground">
          Create New Character Sheet
        </h1>
        <p className="text-xs text-muted-foreground mt-1 mb-6">
          Design an adaptive, responsive character sheet layout using visual auto-layout primitives.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
          {error && (
            <div className="p-3 rounded bg-destructive/10 border border-destructive/30 text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className="font-semibold text-foreground">Sheet Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Standard Player Sheet, Starship Sheet, NPC Statblock…"
              className="w-full mt-1 px-3 py-2 text-sm bg-background border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="font-semibold text-foreground">Sheet Kind</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as SheetKind)}
              className="w-full mt-1 px-3 py-2 text-sm bg-background border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none capitalize"
            >
              <option value="character">Player Character Sheet</option>
              <option value="npc">NPC / Monster Statblock</option>
              <option value="vehicle">Vehicle / Ship Sheet</option>
              <option value="handout">Handout / Reference Card</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-foreground">Description (Optional)</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes or instructions for this sheet layout…"
              className="w-full mt-1 px-3 py-2 text-sm bg-background border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border mt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-primary text-primary-foreground font-semibold text-sm rounded-md hover:bg-primary/90 shadow-sm"
            >
              {loading ? "Creating Sheet…" : "Create & Launch Builder"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
