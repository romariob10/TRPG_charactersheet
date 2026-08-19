"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export interface PopoverRenderProps {
  close: () => void;
}

export function Popover({
  trigger,
  children,
  label,
  align = "start",
  side = "top",
  className,
  contentClassName,
}: {
  trigger: (state: { open: boolean }) => ReactNode;
  children: ReactNode | ((state: PopoverRenderProps) => ReactNode);
  label: string;
  align?: "start" | "end";
  side?: "top" | "bottom";
  className?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? contentId : undefined}
        onClick={() => setOpen((previous) => !previous)}
        className="block w-full text-left"
      >
        {trigger({ open })}
      </button>

      {open && (
        <div
          id={contentId}
          role="dialog"
          aria-label={label}
          className={cn(
            "absolute z-50 min-w-56 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            align === "start" ? "left-0" : "right-0",
            contentClassName,
          )}
        >
          {typeof children === "function"
            ? children({ close: () => setOpen(false) })
            : children}
        </div>
      )}
    </div>
  );
}

export function PopoverItem({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-[13px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--keylime)] focus-visible:bg-[var(--keylime)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
