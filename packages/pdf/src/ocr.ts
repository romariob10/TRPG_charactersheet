import { createWorker } from "tesseract.js";
import type { TextToken } from "./catalog.js";

interface OcrWord {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

interface OcrBlock {
  paragraphs?: Array<{ lines?: Array<{ words?: OcrWord[] }> }>;
}

export async function recognizePage(
  image: Buffer,
  page: number,
  width: number,
  height: number,
): Promise<TextToken[]> {
  const languagePath = process.env.OCR_LANG_PATH;
  const worker = await createWorker(["eng", "rus"], 1, {
    ...(languagePath
      ? {
          cacheMethod: "none",
          gzip: false,
          langPath: languagePath,
        }
      : {}),
  });
  try {
    const result = await worker.recognize(image);
    const blocks = (result.data.blocks ?? []) as OcrBlock[];
    return blocks.flatMap((block) =>
      (block.paragraphs ?? []).flatMap((paragraph) =>
        (paragraph.lines ?? []).flatMap((line) =>
          (line.words ?? [])
            .filter((word) => word.text?.trim() && word.bbox && (word.confidence ?? 0) >= 45)
            .map((word) => ({
              text: word.text!.trim(),
              page,
              rect: [
                word.bbox!.x0 / width,
                word.bbox!.y0 / height,
                word.bbox!.x1 / width,
                word.bbox!.y1 / height,
              ] as [number, number, number, number],
              fontSize: word.bbox!.y1 - word.bbox!.y0,
              source: "ocr" as const,
            })),
        ),
      ),
    );
  } finally {
    await worker.terminate();
  }
}
