import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

describe("design primitives", () => {
  it("keeps buttons compact, accessible, and token-driven", () => {
    const html = renderToStaticMarkup(<Button size="sm">Save</Button>);

    expect(html).toContain("h-9");
    expect(html).toContain("focus-visible:outline-[var(--brand)]");
    expect(buttonClassName({ variant: "secondary" })).toContain(
      "var(--surface)",
    );
  });

  it("uses a flat token-driven input with a visible focus state", () => {
    const html = renderToStaticMarkup(<Input aria-label="Name" />);

    expect(html).toContain("rounded-[var(--radius-control)]");
    expect(html).toContain("focus-visible:ring");
    expect(html).not.toContain("shadow-sm");
  });
});
