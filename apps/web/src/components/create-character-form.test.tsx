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
