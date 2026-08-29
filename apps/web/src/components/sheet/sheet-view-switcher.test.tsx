// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetViewSwitcher } from "./sheet-view-switcher";

afterEach(cleanup);

describe("SheetViewSwitcher", () => {
  it("shows explicit mobile, desktop, and print targets in the template builder", () => {
    const onChange = vi.fn();
    render(
      <SheetViewSwitcher
        value="desktop"
        onChange={onChange}
        adaptiveLabel="Adaptive"
        mobileLabel="Mobile"
        desktopLabel="Desktop"
        printLabel="Print"
        kind="builder"
      />,
    );

    expect(screen.queryByRole("button", { name: "Adaptive" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mobile" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Print" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Mobile" }));
    expect(onChange).toHaveBeenCalledWith("mobile");
  });
});
