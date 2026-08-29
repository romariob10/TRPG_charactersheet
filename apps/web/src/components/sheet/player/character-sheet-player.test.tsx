// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  defaultBoxProps,
  type LayoutNode,
  type SheetVersionDetails,
} from "@mycharacter/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CharacterSheetPlayer } from "./character-sheet-player";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const fetchMock = vi.fn();

function matchMedia(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "(max-width: 767px)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

function layout(id: string): LayoutNode {
  return {
    id,
    kind: "frame",
    direction: "vertical",
    gap: 0,
    align: "stretch",
    justify: "start",
    wrap: false,
    collapseAdjacentStrokes: false,
    ornamentStyle: "none",
    titleDock: { dock: "none", variant: "none" },
    footerDock: { dock: "none", variant: "none" },
    box: defaultBoxProps,
    children: [
      {
        id: `${id}-field`,
        kind: "field-input",
        fieldBinding: "name",
        label: "Character name",
        placeholder: "Name",
        variant: "boxed",
        readOnly: false,
        box: defaultBoxProps,
      },
    ],
  };
}

const versionDetails: SheetVersionDetails = {
  id: "11111111-1111-4111-8111-111111111111",
  sheetId: "22222222-2222-4222-8222-222222222222",
  versionNumber: 1,
  schemaVersion: 1,
  layouts: {
    mobile: layout("mobile"),
    tablet: layout("tablet"),
    desktop: layout("desktop"),
    print: layout("print"),
  },
  fields: [],
  changelog: "",
  authorId: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-08-29T00:00:00.000Z",
};

function versionWithNode(node: LayoutNode): SheetVersionDetails {
  const makeLayout = (target: string): LayoutNode => {
    const root = layout(target);
    if (root.kind !== "frame") throw new Error("Expected a frame root.");
    return { ...root, children: [node] };
  };
  return {
    ...versionDetails,
    layouts: {
      mobile: makeLayout("mobile-custom"),
      tablet: makeLayout("tablet-custom"),
      desktop: makeLayout("desktop-custom"),
      print: makeLayout("print-custom"),
    },
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => matchMedia(false)),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CharacterSheetPlayer", () => {
  it("shows only adaptive and A4 modes and keeps the print canvas at 595 by 874", () => {
    render(
      <CharacterSheetPlayer
        character={{ id: "character-1", name: "Hero" }}
        versionDetails={versionDetails}
        canEdit
      />,
    );

    expect(screen.getByRole("button", { name: "adaptive" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "tablet" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "print" }));
    const page = document.querySelector<HTMLElement>("[data-sheet-page]");
    expect(page).toHaveAttribute("data-sheet-target", "print");
    expect(page).toHaveStyle({ width: "595px", height: "874px" });
  });

  it("coalesces rapid typing and sends the required field version", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          value: "Eris",
          version: 1,
          revision: 1,
          overwrittenRemote: false,
          updatedAt: "2026-08-29T00:00:00.000Z",
          updatedBy: "33333333-3333-4333-8333-333333333333",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(
      <CharacterSheetPlayer
        character={{
          id: "character-1",
          name: "Hero",
          fieldValues: { name: "" },
        }}
        versionDetails={versionDetails}
        canEdit
      />,
    );

    const input = screen.getByPlaceholderText("Name");
    fireEvent.change(input, { target: { value: "E" } });
    fireEvent.change(input, { target: { value: "Er" } });
    fireEvent.change(input, { target: { value: "Eris" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/characters/character-1/sheet-fields/name",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"expectedVersion":0'),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      value: "Eris",
      expectedVersion: 0,
    });
  });

  it("requests the vector PDF with POST before downloading it", async () => {
    fetchMock.mockResolvedValue(
      new Response("pdf", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:character-pdf"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const downloadClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(
      <CharacterSheetPlayer
        character={{ id: "character-1", name: "Hero" }}
        versionDetails={versionDetails}
        canEdit
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "exportPdf" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/characters/character-1/export?mode=interactive",
        { method: "POST" },
      ),
    );
    await waitFor(() => expect(downloadClick).toHaveBeenCalledTimes(1));
  });

  it("uploads a portrait into the image field owned by the character", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          file: {
            id: "44444444-4444-4444-8444-444444444444",
            url: "/api/characters/character-1/images/44444444-4444-4444-8444-444444444444",
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    const imageNode: LayoutNode = {
      id: "portrait-node",
      kind: "image",
      fieldBinding: "portrait",
      url: "",
      alt: "Portrait",
      fit: "cover",
      box: { ...defaultBoxProps, height: { mode: "fixed", value: 160 } },
    };
    render(
      <CharacterSheetPlayer
        character={{ id: "character-1", name: "Hero" }}
        versionDetails={versionWithNode(imageNode)}
        canEdit
      />,
    );

    const input = screen
      .getByText("portraitPlaceholder")
      .closest("label")
      ?.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();
    fireEvent.change(input!, {
      target: {
        files: [new File(["png"], "portrait.png", { type: "image/png" })],
      },
    });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/characters/character-1/images?fieldKey=portrait",
        expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
      ),
    );
  });

  it("persists a manually resized textarea height for print and future sessions", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          value: 180,
          version: 1,
          revision: 1,
          overwrittenRemote: false,
          updatedAt: "2026-08-29T00:00:00.000Z",
          updatedBy: "33333333-3333-4333-8333-333333333333",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const textareaNode: LayoutNode = {
      id: "notes-node",
      kind: "textarea",
      fieldBinding: "notes",
      label: "Notes",
      rows: 3,
      placeholder: "Notes",
      variant: "boxed",
      readOnly: false,
      box: { ...defaultBoxProps, height: { mode: "fill" } },
    };
    render(
      <CharacterSheetPlayer
        character={{ id: "character-1", name: "Hero" }}
        versionDetails={versionWithNode(textareaNode)}
        canEdit
      />,
    );

    const textarea = screen.getByPlaceholderText("Notes");
    vi.spyOn(textarea, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 300,
      height: 180,
      top: 0,
      right: 300,
      bottom: 180,
      left: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerUp(textarea);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/characters/character-1/sheet-fields/__layout_height__%3Anotes",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining('"value":180'),
        }),
      ),
    );
  });
});
