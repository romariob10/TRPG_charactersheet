// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultBoxProps } from "@mycharacter/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderNumberInput, RenderTextarea } from "./primitive-renderers";
import { SheetRenderProvider } from "./sheet-render-context";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(cleanup);

describe("sheet primitive inputs", () => {
  it("commits a numeric value only after focus leaves the input", () => {
    const onFieldValueChange = vi.fn();
    render(
      <SheetRenderProvider
        value={{
          target: "desktop",
          mode: "player",
          fieldValues: { stress: 9 },
          onFieldValueChange,
        }}
      >
        <RenderNumberInput
          node={{
            id: crypto.randomUUID(),
            kind: "number-input",
            fieldBinding: "stress",
            label: "",
            placeholder: "",
            variant: "boxed",
            showSign: false,
            readOnly: false,
            box: defaultBoxProps,
          }}
        />
      </SheetRenderProvider>,
    );

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "14" } });
    expect(onFieldValueChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onFieldValueChange).toHaveBeenCalledWith("stress", 14);
  });

  it("keeps manual resizing available when a textarea fills its parent height", () => {
    render(
      <SheetRenderProvider
        value={{ target: "desktop", mode: "player", fieldValues: { notes: "" } }}
      >
        <RenderTextarea
          node={{
            id: crypto.randomUUID(),
            kind: "textarea",
            fieldBinding: "notes",
            label: "",
            placeholder: "",
            rows: 3,
            variant: "boxed",
            readOnly: false,
            box: { ...defaultBoxProps, height: { mode: "fill" } },
          }}
        />
      </SheetRenderProvider>,
    );

    expect(screen.getByRole("textbox")).toHaveClass("resize-y");
    expect(screen.getByRole("textbox")).not.toHaveClass("resize-none");
  });

  it("restores the saved font size and grows to the text content", () => {
    const onFieldValueChange = vi.fn();
    const { rerender } = render(
      <SheetRenderProvider
        value={{
          target: "desktop",
          mode: "player",
          fieldValues: {
            notes: "A long note",
            "__layout_font_size__:notes": 19,
            "__layout_height__:notes": 90,
          },
          onFieldValueChange,
        }}
      >
        <RenderTextarea
          node={{
            id: crypto.randomUUID(),
            kind: "textarea",
            fieldBinding: "notes",
            label: "",
            placeholder: "",
            rows: 3,
            variant: "boxed",
            readOnly: false,
            box: defaultBoxProps,
          }}
        />
      </SheetRenderProvider>,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 140 });
    rerender(
      <SheetRenderProvider
        value={{
          target: "desktop",
          mode: "player",
          fieldValues: {
            notes: "A longer note that triggers sizing",
            "__layout_font_size__:notes": 19,
            "__layout_height__:notes": 90,
          },
          onFieldValueChange,
        }}
      >
        <RenderTextarea
          node={{
            id: "notes-node",
            kind: "textarea",
            fieldBinding: "notes",
            label: "",
            placeholder: "",
            rows: 3,
            variant: "boxed",
            readOnly: false,
            box: defaultBoxProps,
          }}
        />
      </SheetRenderProvider>,
    );

    expect(screen.getByRole("textbox")).toHaveStyle({ fontSize: "19px", height: "140px" });
    fireEvent.click(screen.getByRole("button", { name: "textareaFontLarger" }));
    expect(onFieldValueChange).toHaveBeenCalledWith("__layout_font_size__:notes", 20);
  });
});
