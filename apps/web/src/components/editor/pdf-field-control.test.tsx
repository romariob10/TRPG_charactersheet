// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CharacterField, FieldKind } from "@/lib/types";
import { PdfFieldControl } from "./pdf-field-control";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(cleanup);

function characterField(kind: FieldKind): CharacterField {
  return {
    id: `field-${kind}`,
    pdfName: `field-${kind}`,
    kind,
    label: "Race",
    aliases: [],
    section: "Identity",
    page: 1,
    options: [],
    groupId: null,
    groupOrder: null,
    confidence: 1,
    source: "manual",
    widgets: [],
    value: "Эльф",
    version: 1,
    updatedAt: "2026-08-22T00:00:00.000Z",
    updatedBy: null,
  };
}

const widget = {
  id: "widget-1",
  page: 1,
  rect: [0.1, 0.1, 0.4, 0.2] as [number, number, number, number],
  pdfRect: [10, 10, 40, 20] as [number, number, number, number],
  rotation: 0,
  exportValue: null,
};

describe("PdfFieldControl", () => {
  it.each(["text", "multiline"] as const)(
    "keeps entered %s values dark on the white PDF surface",
    (kind) => {
      render(
        <PdfFieldControl
          field={characterField(kind)}
          widget={widget}
          value="Эльф"
          zoom={1}
          multilineFontScale={1}
          active={false}
          onChange={vi.fn()}
          onFocus={vi.fn()}
          onBlur={vi.fn()}
        />,
      );

      expect(screen.getByLabelText("Race")).toHaveClass(
        "text-[#111827]",
        "font-medium",
        "[color-scheme:light]",
      );
    },
  );
});
