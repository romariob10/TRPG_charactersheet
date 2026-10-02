// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  defaultBoxProps,
  sheetEditorDataResponseSchema,
  type LayoutNode,
} from "@mycharacter/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { SheetBuilderMain } from "./sheet-builder-main";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  apiFetch: vi.fn(),
}));
vi.mock("@/components/agent-presence", () => ({ AgentPresence: () => null }));

function initialData() {
  const child: LayoutNode = {
    id: crypto.randomUUID(),
    kind: "text",
    text: "Existing",
    variant: "body",
    align: "left",
    weight: "normal",
    fontFamily: "Noto Sans",
    uppercase: false,
    color: "default",
    box: defaultBoxProps,
  };
  const nested: LayoutNode = {
    id: crypto.randomUUID(),
    kind: "frame",
    direction: "vertical",
    gap: 9,
    align: "stretch",
    justify: "start",
    wrap: false,
    collapseAdjacentStrokes: false,
    box: defaultBoxProps,
    children: [child],
  };
  const root: LayoutNode = {
    ...nested,
    id: crypto.randomUUID(),
    children: [nested],
  };
  return sheetEditorDataResponseSchema.parse({
    sheetDefinition: {
      id: crypto.randomUUID(),
      title: "Test sheet",
      updatedAt: "now",
    },
    system: {
      id: crypto.randomUUID(),
      slug: "test",
      title: "Test",
      visibility: "private",
      createdAt: "now",
      updatedAt: "now",
    },
    draft: {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      revision: 0,
      layouts: { desktop: root, mobile: root, tablet: root, print: root },
      fields: [],
      updatedAt: "now",
    },
    versions: [],
    isOwner: true,
  });
}

async function saveDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(apiFetch).mockReset().mockResolvedValue({
    revision: 1,
    updatedAt: "now",
    valid: true,
    validationErrors: [],
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function openPalette() {
  fireEvent.click(screen.getAllByRole("button", { name: "palette" })[0]!);
}

describe("SheetBuilderMain", () => {
  it("inserts beside the selected child and preserves its container through undo and redo", async () => {
    const data = initialData();
    const root = data.draft.layouts.desktop;
    if (root.kind !== "frame" || root.children[0]?.kind !== "frame")
      throw new Error("Missing fixture frame");
    const nested = root.children[0];
    const { container } = render(
      <SheetBuilderMain initialData={data} systemId={data.system.id} />,
    );
    const childElement = container.querySelector(
      `[data-node-id="${nested.children[0]?.id}"]`,
    );
    if (!childElement) throw new Error("Missing child");
    fireEvent.click(childElement);
    openPalette();
    fireEvent.click(screen.getByRole("button", { name: /headerText/ }));
    expect(screen.getByRole("button", { name: "publish" })).toBeDisabled();
    await saveDebounce();
    const body = JSON.parse(
      String(vi.mocked(apiFetch).mock.calls.at(-1)?.[1]?.body),
    );
    expect(body.layouts.desktop.children).toHaveLength(1);
    expect(body.layouts.desktop.children[0].children).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "undo" }));
    expect(
      container.querySelectorAll(
        `[data-node-id="${nested.id}"] [data-node-id]`,
      ),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "redo" }));
    expect(
      container.querySelectorAll(
        `[data-node-id="${nested.id}"] [data-node-id]`,
      ),
    ).toHaveLength(2);
  });

  it("allows retry after a failed save and blocks publication until it succeeds", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(
      new ApiClientError("offline", 503),
    );
    const data = initialData();
    render(<SheetBuilderMain initialData={data} systemId={data.system.id} />);
    openPalette();
    fireEvent.click(screen.getByRole("button", { name: /headerText/ }));
    await saveDebounce();
    expect(screen.getByRole("status")).toHaveTextContent("error");
    expect(screen.getByRole("button", { name: "publish" })).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "retrySave" }));
    });
    expect(screen.getByRole("status")).toHaveTextContent("saved");
    expect(screen.getByRole("button", { name: "publish" })).toBeEnabled();
    expect(
      vi
        .mocked(apiFetch)
        .mock.calls.map(
          (call) => JSON.parse(String(call[1]?.body)).expectedRevision,
        ),
    ).toEqual([0, 0]);
  });

  it("undoes and redoes a new field definition together with its binding", async () => {
    const data = initialData();
    render(<SheetBuilderMain initialData={data} systemId={data.system.id} />);
    openPalette();
    fireEvent.click(screen.getByRole("button", { name: /textInput/ }));
    fireEvent.click(screen.getByRole("button", { name: "createNewField" }));
    fireEvent.change(screen.getByRole("textbox", { name: "fieldKey" }), {
      target: { value: "strength" },
    });
    fireEvent.click(screen.getByRole("button", { name: "saveAndBind" }));
    await saveDebounce();
    const savedBody = () =>
      JSON.parse(String(vi.mocked(apiFetch).mock.calls.at(-1)?.[1]?.body));
    expect(savedBody().fields).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "undo" }));
    await saveDebounce();
    expect(savedBody().fields).toHaveLength(0);
    expect(JSON.stringify(savedBody().layouts)).not.toContain(
      '"fieldBinding":"strength"',
    );
    fireEvent.click(screen.getByRole("button", { name: "redo" }));
    await saveDebounce();
    expect(savedBody().fields[0].key).toBe("strength");
    expect(JSON.stringify(savedBody().layouts)).toContain(
      '"fieldBinding":"strength"',
    );
  });

  it("undoes the Fate preset and its fields together without replacing other layouts", async () => {
    const data = initialData();
    for (const root of Object.values(data.draft.layouts)) {
      if (root.kind === "frame") root.children = [];
    }
    render(<SheetBuilderMain initialData={data} systemId={data.system.id} />);
    fireEvent.click(screen.getByRole("button", { name: "usePreset" }));
    await saveDebounce();
    const savedBody = () => JSON.parse(String(vi.mocked(apiFetch).mock.calls.at(-1)?.[1]?.body));
    expect(savedBody().fields).toHaveLength(31);
    fireEvent.click(screen.getByRole("button", { name: "undo" }));
    await saveDebounce();
    expect(savedBody().fields).toHaveLength(0);
    expect(screen.getByRole("button", { name: "usePreset" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "redo" }));
    await saveDebounce();
    expect(savedBody().fields).toHaveLength(31);
  });

  it("offers the preset only when all layouts are empty", () => {
    const data = initialData();
    const desktop = data.draft.layouts.desktop;
    if (desktop.kind === "frame") data.draft.layouts.desktop = { ...desktop, children: [] };
    render(<SheetBuilderMain initialData={data} systemId={data.system.id} />);
    expect(screen.queryByRole("button", { name: "usePreset" })).not.toBeInTheDocument();
  });

  it("requires confirmation before adapting layouts and can undo the replacement", async () => {
    const data = initialData();
    data.draft.layouts.mobile = {
      ...data.draft.layouts.mobile,
      name: "Original mobile",
    };
    render(<SheetBuilderMain initialData={data} systemId={data.system.id} />);
    fireEvent.click(screen.getByRole("button", { name: "adaptTargets" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("adaptConfirm");
    expect(apiFetch).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "adaptTargets" }),
    );
    await saveDebounce();
    expect(
      JSON.parse(String(vi.mocked(apiFetch).mock.calls.at(-1)?.[1]?.body))
        .layouts.mobile.name,
    ).not.toBe("Original mobile");
    fireEvent.click(screen.getByRole("button", { name: "undo" }));
    await saveDebounce();
    expect(
      JSON.parse(String(vi.mocked(apiFetch).mock.calls.at(-1)?.[1]?.body))
        .layouts.mobile.name,
    ).toBe("Original mobile");
  });

  it("serializes edits made while a save is in flight", async () => {
    let resolveSave: (value: unknown) => void = () => {};
    vi.mocked(apiFetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const data = initialData();
    render(<SheetBuilderMain initialData={data} systemId={data.system.id} />);
    openPalette();
    fireEvent.click(screen.getByRole("button", { name: /headerText/ }));
    await saveDebounce();
    fireEvent.click(screen.getByRole("button", { name: /textInput/ }));
    await act(async () => {
      resolveSave({ revision: 1, updatedAt: "now", valid: true });
    });
    expect(screen.getByRole("button", { name: "publish" })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(String(vi.mocked(apiFetch).mock.calls[1]?.[1]?.body))
        .expectedRevision,
    ).toBe(1);
    expect(screen.getByRole("button", { name: "publish" })).toBeEnabled();
  });
});
