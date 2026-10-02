// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { textareaNodeSchema, type FieldValue } from "@mycharacter/contracts";
import { SheetRenderProvider } from "./sheet-render-context";
import { RenderTextarea } from "./primitive-renderers";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
afterEach(cleanup);

it("preserves saved list content when the builder selects ordinary multiline text", () => {
  const node = textareaNodeSchema.parse({ id: crypto.randomUUID(), kind: "textarea", fieldBinding: "notes", listStyle: "none" });
  render(<SheetRenderProvider value={{ target: "desktop", mode: "player", fieldValues: { notes: ["First\ncontinued", "Second"] } }}><RenderTextarea node={node} /></SheetRenderProvider>);
  expect(screen.getByRole("textbox")).toHaveValue("First\ncontinued\nSecond");
});

it("edits independent multiline items and persists a player-selected count", () => {
  const node = textareaNodeSchema.parse({ id: crypto.randomUUID(), kind: "textarea", fieldBinding: "notes", listStyle: "numbered", itemCount: 3, allowItemCountChange: true });
  const commit = vi.fn();
  const save = vi.fn();
  function Harness() {
    const [values, setValues] = useState<Record<string, FieldValue>>({ notes: ["First\ncontinued", "Second"], __layout_main_font_size__: 10 });
    return <SheetRenderProvider value={{ target: "desktop", mode: "player", fieldValues: values,
      onFieldValueChange: (key, value) => { save(key, value); setValues(previous => ({ ...previous, [key]: value })); }, onFieldCommit: commit }}><RenderTextarea node={node} /></SheetRenderProvider>;
  }
  render(<Harness />);
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
  expect(screen.getAllByRole("textbox")[0]).toHaveValue("First\ncontinued");
  expect(screen.getAllByRole("textbox")[0]).toHaveStyle({ fontSize: "10px", lineHeight: "1.25" });
  fireEvent.change(screen.getAllByRole("textbox")[1]!, { target: { value: "Changed\nline" } });
  expect(save).toHaveBeenLastCalledWith("notes", ["First\ncontinued", "Changed\nline"]);
  fireEvent.click(screen.getByRole("button", { name: "addListItem" }));
  expect(screen.getAllByRole("textbox")).toHaveLength(3);
  expect(commit).toHaveBeenCalledWith("notes");
  fireEvent.click(screen.getAllByRole("button", { name: "removeListItem" })[2]!);
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
});

it("keeps fixed lists separate and restores values from legacy aspect fields", () => {
  const node = textareaNodeSchema.parse({ id: crypto.randomUUID(), kind: "textarea", fieldBinding: "aspect_items", listStyle: "lined", itemCount: 2, itemBindings: ["aspect_1", "aspect_2"], itemLabels: ["Concept", "Trouble"] });
  render(<SheetRenderProvider value={{ target: "desktop", mode: "player", fieldValues: { aspect_1: "Concept\ncontinued", aspect_2: "Trouble" } }}><RenderTextarea node={node} /></SheetRenderProvider>);
  expect(screen.getByRole("textbox", { name: "Concept" })).toHaveValue("Concept\ncontinued");
  expect(screen.getByRole("textbox", { name: "Trouble" })).toHaveValue("Trouble");
  expect(screen.queryByRole("button", { name: "addListItem" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("listitem").every(item => item.classList.contains("border-b"))).toBe(true);
});

it("saves prepared marks independently of spell text and disables them in print mode", () => {
  const node = textareaNodeSchema.parse({ id: crypto.randomUUID(), kind: "textarea", fieldBinding: "spells", listStyle: "lined",
    itemCount: 2, itemCheckboxBindings: ["prepared_1", "prepared_2"], itemLabels: ["First spell", "Second spell"] });
  const save = vi.fn(), commit = vi.fn();
  const view = render(<SheetRenderProvider value={{ target: "desktop", mode: "player", fieldValues: { spells: ["Magic missile", "Shield"], prepared_1: true },
    onFieldValueChange: save, onFieldCommit: commit }}><RenderTextarea node={node} /></SheetRenderProvider>);
  expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
  fireEvent.click(screen.getAllByRole("checkbox")[1]);
  expect(save).toHaveBeenLastCalledWith("prepared_2", true);
  expect(commit).toHaveBeenLastCalledWith("prepared_2");
  expect(screen.getByRole("textbox", { name: "First spell" })).toHaveValue("Magic missile");
  view.rerender(<SheetRenderProvider value={{ target: "print", mode: "print" }}><RenderTextarea node={node} /></SheetRenderProvider>);
  expect(screen.getAllByRole("checkbox").every(checkbox => checkbox.hasAttribute("disabled"))).toBe(true);
});
