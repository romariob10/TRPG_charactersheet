import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-strong)] px-3.5 text-sm outline-none transition-colors placeholder:text-slate-400 focus-visible:border-[var(--brand)] focus-visible:ring-3 focus-visible:ring-[var(--brand-soft)]",
        className,
      )}
      {...props}
    />
  );
}
