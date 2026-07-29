"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TemplateField } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TemplatePdfPage({
  document,
  pageNumber,
  zoom,
  fields,
  activeFieldId,
  onSelectField,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  fields: TemplateField[];
  activeFieldId: string | null;
  onSelectField: (fieldId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 612, height: 792 });

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null =
      null;
    void document.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: zoom });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setSize({ width: viewport.width, height: viewport.height });
      const context = canvas.getContext("2d");
      if (!context) return;
      renderTask = page.render({
        canvas,
        viewport,
        transform:
          outputScale === 1
            ? undefined
            : [outputScale, 0, 0, outputScale, 0, 0],
        annotationMode: 0,
      });
      void renderTask.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, zoom]);

  return (
    <section
      id={`template-pdf-page-${pageNumber}`}
      className="relative mx-auto overflow-hidden bg-white shadow-[0_12px_30px_rgba(15,47,24,0.16)]"
      style={size}
      aria-label={`Page ${pageNumber}`}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {fields.flatMap((field) =>
        field.widgets
          .filter((widget) => widget.page === pageNumber)
          .map((widget) => {
            const [left, top, right, bottom] = widget.rect;
            const active = field.id === activeFieldId;
            return (
              <button
                key={widget.id}
                id={`template-field-widget-${widget.id}`}
                type="button"
                className={cn(
                  "absolute z-10 border-2 border-[var(--info)]/55 bg-[var(--slate)]/20 hover:bg-[var(--slate)]/35 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]",
                  active && "z-20 border-[var(--brand)] bg-[var(--keylime)]/55",
                  !field.enabled &&
                    "border-slate-500 border-dashed bg-slate-300/15 opacity-60",
                )}
                style={{
                  left: `${left * 100}%`,
                  top: `${top * 100}%`,
                  width: `${(right - left) * 100}%`,
                  height: `${(bottom - top) * 100}%`,
                }}
                title={`${field.label} · ${field.pdfName}`}
                aria-label={`${field.label} · ${field.pdfName}`}
                onClick={() => onSelectField(field.id)}
              />
            );
          }),
      )}
    </section>
  );
}
