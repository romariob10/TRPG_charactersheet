"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CharacterField, FieldValue } from "@/lib/types";
import { PdfFieldControl } from "@/components/editor/pdf-field-control";

export function PdfPage({
  document,
  pageNumber,
  zoom,
  multilineFontScale,
  activeFieldId,
  fields,
  values,
  onFieldChange,
  onFieldFocus,
  onFieldBlur,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  multilineFontScale: number;
  activeFieldId: string | null;
  fields: CharacterField[];
  values: Map<string, FieldValue>;
  onFieldChange: (fieldId: string, value: FieldValue) => void;
  onFieldFocus: (fieldId: string) => void;
  onFieldBlur: (fieldId: string) => void;
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
      id={`pdf-page-${pageNumber}`}
      className="relative mx-auto overflow-hidden bg-white shadow-[0_12px_30px_rgba(15,47,24,0.16)]"
      style={size}
      aria-label={`Page ${pageNumber}`}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {fields.flatMap((field) =>
        field.widgets
          .filter((widget) => widget.page === pageNumber)
          .map((widget) => (
            <PdfFieldControl
              key={widget.id}
              field={field}
              widget={widget}
              value={values.get(field.id) ?? null}
              zoom={zoom}
              multilineFontScale={multilineFontScale}
              active={activeFieldId === field.id}
              onChange={(value) => onFieldChange(field.id, value)}
              onFocus={() => onFieldFocus(field.id)}
              onBlur={() => onFieldBlur(field.id)}
            />
          )),
      )}
    </section>
  );
}
