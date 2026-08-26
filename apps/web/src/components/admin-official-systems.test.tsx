// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSystemSummary } from "@mycharacter/contracts";
import { AdminOfficialSystems } from "./admin-official-systems";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ apiFetch }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const system: GameSystemSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "test-system",
  title: "Test System",
  description: "",
  family: null,
  edition: null,
  visibility: "private",
  isOfficial: false,
  isOwner: false,
  sheetCount: 0,
  characterCount: 0,
  materialCount: 0,
  postCount: 0,
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
};

beforeEach(() => {
  apiFetch.mockReset();
});
afterEach(cleanup);

describe("AdminOfficialSystems", () => {
  it("marks a system official through the admin endpoint", async () => {
    apiFetch.mockResolvedValue({
      ...system,
      visibility: "public",
      isOfficial: true,
    });
    render(<AdminOfficialSystems initialSystems={[system]} />);

    fireEvent.click(screen.getByRole("button", { name: "officialMark" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        `/api/admin/game-systems/${system.id}/official`,
        {
          method: "PATCH",
          body: JSON.stringify({ isOfficial: true }),
        },
      ),
    );
    expect(
      screen.getByRole("button", { name: "officialMarked" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("rolls the toggle back when the request fails", async () => {
    let rejectRequest: (reason: Error) => void = () => undefined;
    apiFetch.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    render(<AdminOfficialSystems initialSystems={[system]} />);

    fireEvent.click(screen.getByRole("button", { name: "officialMark" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());
    rejectRequest(new Error("network"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "officialUpdateFailed",
    );
    expect(screen.getByRole("button", { name: "officialMark" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
