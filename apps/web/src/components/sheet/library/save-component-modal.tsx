"use client";

import React, { useState } from "react";
import type {
  ComponentScope,
  CreateComponentRequest,
  LayoutNode,
} from "@mycharacter/contracts";

interface SaveComponentModalProps {
  node: LayoutNode;
  systemId?: string;
  onSaved: () => void;
  onClose: () => void;
}

export const SaveComponentModal: React.FC<SaveComponentModalProps> = ({
  node,
  systemId,
  onSaved,
  onClose,
}) => {
  const [name, setName] = useState(node.name || "Custom Component");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<ComponentScope>("personal");
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);

    const tags = tagInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    try {
      const payload: CreateComponentRequest = {
        name: name.trim(),
        description: description.trim(),
        scope,
        systemId: scope === "system" ? systemId : undefined,
        tags,
        layouts: {
          mobile: node,
          tablet: node,
          desktop: node,
          print: node,
        },
      };

      const res = await fetch("/api/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || "Failed to save component.");
      }

      const created = await res.json();

      // Publish initial v1.0
      await fetch(`/api/components/${created.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changelog: "Initial component creation" }),
      });

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-bold text-foreground">
            Save as Reusable Component
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 flex flex-col gap-4 text-xs">
          {error && (
            <div className="p-2.5 rounded bg-destructive/10 border border-destructive/30 text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className="font-semibold text-foreground">Component Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Saving Throws, Spell Slot Tracker…"
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="font-semibold text-foreground">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this component's purpose…"
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="font-semibold text-foreground">Scope / Visibility</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as ComponentScope)}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none capitalize"
            >
              <option value="personal">Personal (Private to you)</option>
              {systemId && <option value="system">System (Shared with system)</option>}
              <option value="public">Public (Community library)</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-foreground">Tags (comma separated)</label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="combat, stats, inventory…"
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-border rounded-md text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 shadow-sm"
            >
              {saving ? "Saving…" : "Save & Publish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
