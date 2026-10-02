// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  defaultBoxProps,
  type ComponentVersionDetails,
  type LayoutNode,
} from "@mycharacter/contracts";
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
    ).toHaveStyle({ flexGrow: "0", alignSelf: "stretch" });
    expect(
      document.querySelector('[data-node-id="horizontal-height-fill"]'),
    ).toHaveStyle({ flexGrow: "0", alignSelf: "stretch" });
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
    expect(wrapper).toHaveStyle({ gridTemplateRows: "minmax(0, 1fr)" });
    expect(wrapper?.firstElementChild).toHaveClass("flex-col");
  });

  it("uses the template height as a minimum in the player so resized text can grow its parent", () => {
    const fixedFrame = frame("player-frame", "vertical", []);
    fixedFrame.box = {
      ...defaultBoxProps,
      height: { mode: "fixed", value: 120 },
    };

    const { container } = render(
      <SheetRenderProvider value={{ mode: "player", target: "desktop" }}>
        <SheetNodeRenderer node={fixedFrame} />
      </SheetRenderProvider>,
    );

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveStyle({ minHeight: "120px" });
    expect(wrapper).not.toHaveStyle({ height: "120px" });
  });

  it("divides a bounded axis independently of each child's content size", () => {
    const children = ["short", "long"].map((id): LayoutNode => ({
      id,
      kind: "spacer",
      size: id === "short" ? 8 : 80,
      fill: false,
      box: {
        ...defaultBoxProps,
        width: { mode: "fill" },
        height: { mode: "fill" },
      },
    }));
    const root = frame("bounded", "horizontal", children);
    root.box = {
      ...defaultBoxProps,
      width: { mode: "fixed", value: 600 },
      height: { mode: "fixed", value: 200 },
    };
    render(
      <SheetRenderProvider value={{ mode: "builder", target: "desktop" }}>
        <SheetNodeRenderer node={root} />
      </SheetRenderProvider>,
    );
    for (const child of children) {
      expect(
        document.querySelector(`[data-node-id="${child.id}"]`),
      ).toHaveStyle({
        flexGrow: "1",
        flexShrink: "1",
        flexBasis: "0px",
        alignSelf: "stretch",
        minWidth: "0px",
        minHeight: "0px",
      });
    }
  });

  it("preserves intrinsic content when a Fill child is inside a Hug axis", () => {
    const child = frame("fill-child", "vertical", []);
    child.box = { ...defaultBoxProps, height: { mode: "fill" } };
    render(
      <SheetRenderProvider value={{ mode: "builder", target: "desktop" }}>
        <SheetNodeRenderer node={frame("hug-parent", "vertical", [child])} />
      </SheetRenderProvider>,
    );
    expect(document.querySelector('[data-node-id="fill-child"]')).toHaveStyle({
      flexBasis: "auto",
    });
  });

  it("uses the instance allocation and selects the instance through template descendants", () => {
    const template = frame("template-root", "vertical", [
      frame("template-child", "vertical", []),
    ]);
    template.box = {
      ...defaultBoxProps,
      width: { mode: "fixed", value: 100 },
      height: { mode: "fixed", value: 60 },
    };
    const version: ComponentVersionDetails = {
      id: "version",
      componentId: "component",
      versionNumber: 1,
      schemaVersion: 1,
      layouts: {
        desktop: template,
        tablet: template,
        mobile: template,
        print: template,
      },
      exposedProperties: [],
      dependencies: [],
      changelog: "",
      authorId: "author",
      createdAt: "2026-09-30T00:00:00Z",
    };
    const instance: LayoutNode = {
      id: "instance",
      kind: "component-instance",
      componentId: "component",
      componentVersionId: "version",
      propertyOverrides: {},
      box: { ...defaultBoxProps, height: { mode: "fill" } },
    };
    const onSelectNode = vi.fn();
    render(
      <SheetRenderProvider
        value={{
          mode: "builder",
          target: "desktop",
          resolvedComponents: new Map([[version.id, version]]),
          onSelectNode,
        }}
      >
        <SheetNodeRenderer
          node={instance}
          parentDirection="horizontal"
          parentSizing={{ width: true, height: true }}
        />
      </SheetRenderProvider>,
    );
    const root = document.querySelector('[data-node-id="template-root"]');
    expect(root).toHaveStyle({ flexBasis: "0px", alignSelf: "stretch" });
    expect(root).not.toHaveStyle({ width: "100px", height: "60px" });
    fireEvent.click(document.querySelector('[data-node-id="template-child"]')!);
    expect(onSelectNode).toHaveBeenCalledWith("instance");
    expect(template.box.width).toEqual({ mode: "fixed", value: 100 });
  });
});
