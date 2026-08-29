"use client";

import { FileText, PanelsTopLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export type SheetViewMode = "adaptive" | "print";

export function SheetViewSwitcher({
  value,
  onChange,
  adaptiveLabel,
  printLabel,
}: {
  value: SheetViewMode;
  onChange: (value: SheetViewMode) => void;
  adaptiveLabel: string;
  printLabel: string;
}) {
  const items = [
    { value: "adaptive" as const, label: adaptiveLabel, icon: PanelsTopLeft },
    { value: "print" as const, label: printLabel, icon: FileText },
  ];

  return (
    <div className="flex items-center gap-1 rounded-[var(--radius-control)] bg-[var(--keylime)] p-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            aria-pressed={active}
            className={cn(
              "flex h-9 items-center gap-2 rounded-[7px] px-3 text-sm font-semibold transition-colors",
              active
                ? "bg-[var(--surface)] text-[var(--brand)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--brand)]",
            )}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
