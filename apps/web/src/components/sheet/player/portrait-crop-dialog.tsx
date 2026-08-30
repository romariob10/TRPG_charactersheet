"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Crop, Loader2, X } from "lucide-react";

interface PortraitCropDialogProps {
  source: File | string;
  onCancel: () => void;
  onConfirm: (file: File, aspectRatio: number) => void | Promise<void>;
}

interface ImageSize {
  width: number;
  height: number;
}

function cropRectangle(
  image: ImageSize,
  aspectRatio: number,
  zoom: number,
  xPercent: number,
  yPercent: number,
) {
  const imageRatio = image.width / image.height;
  const baseWidth = imageRatio > aspectRatio ? image.height * aspectRatio : image.width;
  const baseHeight = imageRatio > aspectRatio ? image.height : image.width / aspectRatio;
  const width = baseWidth / zoom;
  const height = baseHeight / zoom;
  return {
    x: ((image.width - width) * xPercent) / 100,
    y: ((image.height - height) * yPercent) / 100,
    width,
    height,
  };
}

export function PortraitCropDialog({
  source,
  onCancel,
  onConfirm,
}: PortraitCropDialogProps) {
  const t = useTranslations("PortraitCrop");
  const previewRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [aspectRatio, setAspectRatio] = useState(0.75);
  const [zoom, setZoom] = useState(1);
  const [xPercent, setXPercent] = useState(50);
  const [yPercent, setYPercent] = useState(50);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceUrl = useMemo(
    () => (typeof source === "string" ? source : URL.createObjectURL(source)),
    [source],
  );

  useEffect(() => {
    return () => {
      if (typeof source !== "string") URL.revokeObjectURL(sourceUrl);
    };
  }, [source, sourceUrl]);

  useEffect(() => {
    const image = new window.Image();
    image.onload = () => {
      imageRef.current = image;
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      setAspectRatio(image.naturalWidth / image.naturalHeight);
    };
    image.onerror = () => setError(t("loadFailed"));
    image.src = sourceUrl;
    return () => {
      image.onload = null;
      image.onerror = null;
      imageRef.current = null;
    };
  }, [sourceUrl, t]);

  useEffect(() => {
    const canvas = previewRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageSize) return;
    const width = Math.min(520, Math.max(220, Math.round(360 * aspectRatio)));
    const height = Math.round(width / aspectRatio);
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    const crop = cropRectangle(imageSize, aspectRatio, zoom, xPercent, yPercent);
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }, [aspectRatio, imageSize, xPercent, yPercent, zoom]);

  const finishCrop = async () => {
    const image = imageRef.current;
    if (!image || !imageSize || saving) return;
    setSaving(true);
    setError(null);
    try {
      const crop = cropRectangle(imageSize, aspectRatio, zoom, xPercent, yPercent);
      const outputWidth = Math.max(1, Math.min(1600, Math.round(crop.width)));
      const outputHeight = Math.max(1, Math.round(outputWidth / aspectRatio));
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        outputWidth,
        outputHeight,
      );
      const mediaType = source instanceof File && source.type === "image/png"
        ? "image/png"
        : "image/jpeg";
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("Crop failed"))),
          mediaType,
          0.92,
        );
      });
      const baseName = source instanceof File ? source.name.replace(/\.[^.]+$/, "") : "portrait";
      await onConfirm(
        new File([blob], `${baseName}-cropped.${mediaType === "image/png" ? "png" : "jpg"}`, {
          type: mediaType,
        }),
        aspectRatio,
      );
    } catch {
      setError(t("applyFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="portrait-crop-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4"
    >
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="portrait-crop-title" className="text-lg font-bold text-foreground">
              {t("title")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded p-2 hover:bg-muted" aria-label={t("cancel")}>
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex min-h-64 items-center justify-center overflow-auto rounded-lg bg-black/90 p-3">
          {imageSize ? (
            <canvas ref={previewRef} className="max-h-[48vh] max-w-full rounded" />
          ) : (
            <Loader2 className="size-6 animate-spin text-white" aria-label={t("loading")} />
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-foreground">
            {t("ratio")} <span className="font-normal text-muted-foreground">{aspectRatio.toFixed(2)}:1</span>
            <input className="mt-2 w-full accent-primary" type="range" min="0.4" max="2.5" step="0.01" value={aspectRatio} onChange={(event) => setAspectRatio(Number(event.target.value))} />
          </label>
          <label className="text-xs font-semibold text-foreground">
            {t("zoom")} <span className="font-normal text-muted-foreground">{zoom.toFixed(1)}×</span>
            <input className="mt-2 w-full accent-primary" type="range" min="1" max="4" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <label className="text-xs font-semibold text-foreground">
            {t("horizontal")}
            <input className="mt-2 w-full accent-primary" type="range" min="0" max="100" value={xPercent} onChange={(event) => setXPercent(Number(event.target.value))} />
          </label>
          <label className="text-xs font-semibold text-foreground">
            {t("vertical")}
            <input className="mt-2 w-full accent-primary" type="range" min="0" max="100" value={yPercent} onChange={(event) => setYPercent(Number(event.target.value))} />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {error && <p role="alert" className="mr-auto self-center text-xs font-medium text-destructive">{error}</p>}
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">
            {t("cancel")}
          </button>
          <button type="button" onClick={() => void finishCrop()} disabled={!imageSize || saving} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Crop className="size-4" />}
            {t("apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
