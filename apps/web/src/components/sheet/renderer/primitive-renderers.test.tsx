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
});
