export async function renderPdfPage(
  bytes: Uint8Array,
  pageNumber: number,
  scale = 1.6,
  overlays: Array<{ id: string; rect: [number, number, number, number] }> = [],
) {
  const canvasModule = await import("@napi-rs/canvas");
  Object.assign(globalThis, {
    DOMMatrix: canvasModule.DOMMatrix,
    ImageData: canvasModule.ImageData,
    Path2D: canvasModule.Path2D,
  });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
  }).promise;
  const page = await document.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = canvasModule.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  await page.render({
    canvas: null,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
    annotationMode: pdfjs.AnnotationMode.DISABLE,
  }).promise;
  if (overlays.length) {
    context.save();
    context.font = "bold 12px sans-serif";
    context.lineWidth = 2;
    for (const overlay of overlays) {
      const [left, top, right, bottom] = overlay.rect;
      const x = left * canvas.width;
      const y = top * canvas.height;
      const width = (right - left) * canvas.width;
      const height = (bottom - top) * canvas.height;
      context.strokeStyle = "#d33b2f";
      context.fillStyle = "rgba(255,255,255,.9)";
      context.strokeRect(x, y, width, height);
      const label = overlay.id.slice(0, 8);
      const metrics = context.measureText(label);
      context.fillRect(x, Math.max(0, y - 15), metrics.width + 5, 15);
      context.fillStyle = "#a5221a";
      context.fillText(label, x + 2, Math.max(11, y - 3));
    }
    context.restore();
  }
  return { buffer: canvas.toBuffer("image/png"), width: canvas.width, height: canvas.height };
}
