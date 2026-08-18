// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import {
  getDraftKey,
  loadDraft,
  saveDraft,
  clearDraftStorage,
  normalizeEditorBlock,
} from "./use-post-editor";

describe("use-post-editor utilities", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      length: 0,
      key: () => null,
    };
    Object.defineProperty(window, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  it("computes namespaced draft key", () => {
    expect(getDraftKey("user-123")).toBe("mycharacter:post-draft:v1:user-123");
    expect(getDraftKey(null)).toBe("mycharacter:post-draft:v1:anonymous");
  });

  it("saves and loads draft from localStorage", () => {
    const userId = "u1";
    expect(loadDraft(userId)).toBeNull();

    const sampleData = {
      time: Date.now(),
      blocks: [
        {
          type: "paragraph",
          data: { text: "Hello adventure" },
        },
      ],
      version: "2.30.0",
    };

    saveDraft(userId, sampleData);
    const loaded = loadDraft(userId);
    expect(loaded).not.toBeNull();
    expect(loaded?.blocks).toHaveLength(1);
    expect((loaded?.blocks[0].data as Record<string, string>).text).toBe("Hello adventure");

    clearDraftStorage(userId);
    expect(loadDraft(userId)).toBeNull();
  });

  it("normalizes paragraph, header, and delimiter blocks", () => {
    const pBlock = normalizeEditorBlock({
      type: "paragraph",
      data: { text: "Some text" },
    });
    expect(pBlock).toEqual({
      type: "paragraph",
      data: { text: "Some text" },
    });

    const hBlock = normalizeEditorBlock({
      type: "header",
      data: { text: "Heading text", level: 3 },
    });
    expect(hBlock).toEqual({
      type: "header",
      data: { text: "Heading text", level: 3 },
    });

    const delimBlock = normalizeEditorBlock({
      type: "delimiter",
      data: {},
    });
    expect(delimBlock).toEqual({
      type: "delimiter",
      data: {},
    });
  });
});
