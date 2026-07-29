import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWorker: vi.fn(async () => ({
    recognize: vi.fn(async () => ({ data: { blocks: [] } })),
    terminate: vi.fn(async () => undefined),
  })),
}));

vi.mock("tesseract.js", () => ({ createWorker: mocks.createWorker }));

import { recognizePage } from "../src/ocr.js";

describe("local OCR language data", () => {
  const previousLanguagePath = process.env.OCR_LANG_PATH;

  afterEach(() => {
    mocks.createWorker.mockClear();
    if (previousLanguagePath === undefined) {
      delete process.env.OCR_LANG_PATH;
    } else {
      process.env.OCR_LANG_PATH = previousLanguagePath;
    }
  });

  it("loads uncompressed bundled languages without using the Tesseract cache", async () => {
    process.env.OCR_LANG_PATH = "/app/tessdata";

    await expect(
      recognizePage(Buffer.from("image"), 1, 10, 10),
    ).resolves.toEqual([]);
    expect(mocks.createWorker).toHaveBeenCalledWith(["eng", "rus"], 1, {
      cacheMethod: "none",
      gzip: false,
      langPath: "/app/tessdata",
    });
  });
});
