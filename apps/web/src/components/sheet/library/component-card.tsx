"use client";

import React from "react";
import type { ComponentSummary } from "@mycharacter/contracts";

interface ComponentCardProps {
  component: ComponentSummary;
  onSelect?: () => void;
  onInsert?: () => void;
  onFork?: () => void;
}

export const ComponentCard: React.FC<ComponentCardProps> = ({
  component,
  onSelect,
  onInsert,
  onFork,
}) => {
  const scopeBadgeColor = {
    personal: "bg-muted text-muted-foreground",
    system: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    public: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    curated: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  }[component.scope];

  return (
    <div
      onClick={onSelect}
      className="flex flex-col justify-between p-3.5 rounded-lg border border-border bg-card hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow group"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {component.name}
          </h4>
          <span
            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded capitalize ${scopeBadgeColor}`}
          >
            {component.scope}
          </span>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
          {component.description || "No description provided."}
        </p>

        {component.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {component.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/60 text-[11px] text-muted-foreground">
        <div>
          {component.currentVersionNumber
            ? `v${component.currentVersionNumber}`
            : "Draft"}
        </div>

        <div className="flex items-center gap-2">
          {onFork && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFork();
              }}
              className="text-xs hover:text-primary px-1.5 py-0.5 rounded hover:bg-muted font-medium"
            >
              Fork
            </button>
          )}

          {onInsert && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInsert();
              }}
              className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 px-2.5 py-1 rounded font-medium shadow-sm"
            >
              Insert
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
