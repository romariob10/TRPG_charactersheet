"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import Cropper, { type Area } from "react-easy-crop";
import { Crop, Loader2, X } from "lucide-react";

interface PortraitCropDialogProps {
  source: File | string;
  aspectRatio?: number;
  onCancel: () => void;
  onConfirm: (file: File, aspectRatio: number) => void | Promise<void>;
}

export function PortraitCropDialog({ source, aspectRatio: requiredRatio, onCancel, onConfirm }: PortraitCropDialogProps) {
  const t = useTranslations("PortraitCrop");
  const dialogRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [naturalRatio, setNaturalRatio] = useState(1);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"loadFailed" | "applyFailed" | null>(null);
  const aspectRatio = requiredRatio ?? naturalRatio;

  useEffect(() => {
    const reader = typeof source === "string" ? null : new FileReader();
    const image = new window.Image();
    image.onload = () => {
      imageRef.current = image;
      setNaturalRatio(image.naturalWidth / image.naturalHeight);
      setSourceUrl(image.src);
    };
    image.onerror = () => setError("loadFailed");
    if (typeof source === "string") image.src = source;
    else if (reader) {
      reader.onload = () => {
        if (typeof reader.result === "string") image.src = reader.result;
      };
      reader.onerror = () => setError("loadFailed");
      reader.readAsDataURL(source);
    }
    return () => {
      image.onload = null;
      image.onerror = null;
      imageRef.current = null;
      if (reader) {
        reader.onload = null;
        reader.onerror = null;
        if (reader.readyState === FileReader.LOADING) reader.abort();
      }
    };
  }, [source]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  const finishCrop = async () => {
    const image = imageRef.current;
    if (!image || !croppedArea || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Bound both dimensions, including very tall portrait slots.
      const scale = Math.min(1, 1600 / Math.max(croppedArea.width, croppedArea.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(croppedArea.width * scale));
      canvas.height = Math.max(1, Math.round(croppedArea.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.drawImage(image, croppedArea.x, croppedArea.y, croppedArea.width, croppedArea.height, 0, 0, canvas.width, canvas.height);
      const mediaType = source instanceof File && source.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Crop failed")), mediaType, 0.92);
      });
      const baseName = source instanceof File ? source.name.replace(/\.[^.]+$/, "") : "portrait";
      await onConfirm(new File([blob], `${baseName}-cropped.${mediaType === "image/png" ? "png" : "jpg"}`, { type: mediaType }), aspectRatio);
    } catch {
      setError("applyFailed");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="portrait-crop-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !saving) { event.preventDefault(); onCancel(); }
        if (event.key !== "Tab") return;
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]');
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="portrait-crop-title" className="text-lg font-bold text-foreground">{t("title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
          </div>
          <button type="button" onClick={onCancel} disabled={saving} className="rounded p-2 hover:bg-muted disabled:opacity-50" aria-label={t("cancel")}><X className="size-4" /></button>
        </div>
        <div className="relative mt-4 h-[min(48dvh,400px)] min-h-48 overflow-hidden rounded-lg bg-black/90">
          {sourceUrl ? <Cropper image={sourceUrl} crop={crop} zoom={zoom} aspect={aspectRatio}
            onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, area) => setCroppedArea(area)}
            maxZoom={4} zoomSpeed={0.2} keyboardStep={10} cropperProps={{ "aria-label": t("description") }} />
            : <Loader2 className="absolute left-1/2 top-1/2 size-6 animate-spin text-white" aria-label={t("loading")} />}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <p className="text-xs font-semibold">{t("ratio")} <span className="font-normal text-muted-foreground">{aspectRatio.toFixed(2)}:1</span></p>
          <label className="text-xs font-semibold">{t("zoom")} <span className="font-normal text-muted-foreground">{zoom.toFixed(1)}×</span>
            <input className="mt-2 w-full accent-primary" type="range" min="1" max="4" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {error && <p role="alert" className="mr-auto self-center text-xs font-medium text-destructive">{t(error)}</p>}
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">{t("cancel")}</button>
          <button type="button" onClick={() => void finishCrop()} disabled={!croppedArea || saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Crop className="size-4" />}{t("apply")}
          </button>
        </div>
      </div>
    </div>, document.body,
  );
}
