// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { defaultBoxProps, type LayoutNode } from "@mycharacter/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetNodeRenderer } from "./sheet-node-renderer";
import { SheetRenderProvider } from "./sheet-render-context";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(cleanup);

function frame(
  id: string,
  direction: "horizontal" | "vertical",
  children: LayoutNode[],
): LayoutNode {
  return {
    id,
    kind: "frame",
    direction,
    gap: 0,
    align: "stretch",
    justify: "start",
    wrap: false,
    collapseAdjacentStrokes: false,
    ornamentStyle: "none",
    titleDock: { dock: "none", variant: "none" },
    footerDock: { dock: "none", variant: "none" },
    box: defaultBoxProps,
    children,
  };
}

describe("SheetNodeRenderer sizing", () => {
  it("grows only on the parent axis that matches the selected fill dimension", () => {
    const verticalWidthFill: LayoutNode = {
      id: "vertical-width-fill",
      kind: "spacer",
      size: 8,
      fill: false,
      box: {
        ...defaultBoxProps,
        width: { mode: "fill" },
        height: { mode: "fixed", value: 20 },
      },
    };
    const horizontalHeightFill: LayoutNode = {
      id: "horizontal-height-fill",
      kind: "spacer",
      size: 8,
      fill: false,
      box: {
        ...defaultBoxProps,
        width: { mode: "fixed", value: 20 },
        height: { mode: "fill" },
      },
    };
    const root = frame("root", "vertical", [
      verticalWidthFill,
      frame("horizontal", "horizontal", [horizontalHeightFill]),
    ]);

    render(
      <SheetRenderProvider value={{ mode: "builder", target: "desktop" }}>
        <SheetNodeRenderer node={root} />
      </SheetRenderProvider>,
    );

    expect(
      document.querySelector('[data-node-id="vertical-width-fill"]'),
    ).not.toHaveClass("flex-1");
    expect(
      document.querySelector('[data-node-id="horizontal-height-fill"]'),
    ).not.toHaveClass("flex-1");
  });

  it("keeps a fixed frame border attached to the frame height", () => {
    const fixedFrame = frame("fixed-frame", "vertical", []);
    fixedFrame.box = {
      ...defaultBoxProps,
      height: { mode: "fixed", value: 120 },
      strokeWidth: { top: 1, right: 1, bottom: 1, left: 1 },
    };

    render(
      <SheetRenderProvider value={{ mode: "builder", target: "desktop" }}>
        <SheetNodeRenderer node={fixedFrame} />
      </SheetRenderProvider>,
    );

    const wrapper = document.querySelector<HTMLElement>(
      '[data-node-id="fixed-frame"]',
    );
    expect(wrapper).toHaveStyle({ height: "120px" });
    expect(wrapper?.firstElementChild).toHaveClass("h-full");
  });
});
