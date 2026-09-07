// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateCharacterForm } from "./create-character-form";

const { apiFetch, push } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ apiFetch }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

beforeEach(() => {
  apiFetch.mockReset();
  push.mockReset();
});

afterEach(cleanup);

describe("CreateCharacterForm", () => {
  it("groups own, saved, and official creation sources", () => {
    render(
      <CreateCharacterForm
        sources={[
          {
            type: "template",
            group: "mine",
            id: "11111111-1111-4111-8111-111111111111",
            templateId: "11111111-1111-4111-8111-111111111111",
            title: "My PDF",
            systemTitle: "Homebrew",
            pageCount: 1,
          },
          {
            type: "template",
            group: "saved",
            id: "22222222-2222-4222-8222-222222222222",
            templateId: "22222222-2222-4222-8222-222222222222",
            title: "Saved PDF",
            systemTitle: "Community",
            pageCount: 2,
            community: true,
          },
          {
            type: "sheet",
            group: "official",
            id: "33333333-3333-4333-8333-333333333333",
            sheetVersionId: "33333333-3333-4333-8333-333333333333",
            systemId: "44444444-4444-4444-8444-444444444444",
            title: "Official — Character",
            systemTitle: "Official",
            sheetTitle: "Character",
            versionNumber: 3,
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "sourceGroup.mine" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "sourceGroup.saved" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "sourceGroup.official" })).toBeVisible();
    expect(document.querySelectorAll("[data-source-group]")).toHaveLength(3);
    expect(document.querySelector('[data-source-group="mine"]')).toHaveClass("border");
    expect(document.querySelector('[data-source-group="official"]')).toHaveClass(
      "border-[var(--brand)]/25",
    );
    expect(screen.getByRole("button", { name: /Character/ })).toBeVisible();
  });

  it("sends only one create request for rapid repeated submissions", async () => {
    apiFetch.mockImplementation(() => new Promise(() => undefined));
    render(
      <CreateCharacterForm
        templates={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            title: "D&D 5e",
            gameSystem: "D&D",
            pageCount: 1,
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Аэрис" },
    });
    const submit = screen.getByRole("button", { name: "create" });

    act(() => {
      submit.click();
      submit.click();
    });

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledWith("/api/characters", {
      method: "POST",
      body: JSON.stringify({
        name: "Аэрис",
        templateId: "11111111-1111-4111-8111-111111111111",
      }),
    });
  });
});
