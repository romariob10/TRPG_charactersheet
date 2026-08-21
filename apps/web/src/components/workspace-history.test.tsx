// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceItem } from "@mycharacter/contracts";
import { WorkspaceHistory } from "./workspace-history";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const pushMock = vi.fn();
const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

function item(overrides: Partial<WorkspaceItem>): WorkspaceItem {
  return {
    id: "item-1",
    kind: "post",
    targetId: "target-1",
    pinned: false,
    unread: false,
    lastActivityAt: "2026-08-19T10:00:00.000Z",
    title: "Saved post",
    subtitle: "@author",
    url: "/users/author/posts/saved-post",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
  pushMock.mockReset();
});

describe("WorkspaceHistory", () => {
  it("renders fetched items with title and subtitle", async () => {
    apiFetch.mockResolvedValue({
      items: [
        item({}),
        item({
          id: "item-2",
          title: "Chat with Bob",
          subtitle: "hey there",
          kind: "conversation",
        }),
      ],
    });
    render(<WorkspaceHistory collapsed={false} />);

    await waitFor(() => expect(screen.getByText("Saved post")).toBeInTheDocument());
    expect(screen.getByText("@author")).toBeInTheDocument();
    expect(screen.getByText("Chat with Bob")).toBeInTheDocument();
  });

  it("shows the empty state when there are no items", async () => {
    apiFetch.mockResolvedValue({ items: [] });
    render(<WorkspaceHistory collapsed={false} />);

    await waitFor(() => expect(screen.getByText("historyEmpty")).toBeInTheDocument());
  });

  it("toggles a pin and persists it", async () => {
    apiFetch.mockResolvedValue({ items: [item({})] });
    render(<WorkspaceHistory collapsed={false} />);

    await waitFor(() => expect(screen.getByText("Saved post")).toBeInTheDocument());
    const pinButton = screen.getByRole("button", { name: "historyPin" });
    fireEvent.click(pinButton);

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/workspace/history/item-1/pin", {
        method: "PUT",
        body: JSON.stringify({ pinned: true }),
      }),
    );
    expect(screen.getByRole("button", { name: "historyUnpin" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("marks an unread item seen and navigates when opened", async () => {
    apiFetch.mockResolvedValue({ items: [item({ unread: true })] });
    render(<WorkspaceHistory collapsed={false} />);

    await waitFor(() => expect(screen.getByText("Saved post")).toBeInTheDocument());
    expect(screen.getByLabelText("historyUnread")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Saved post" }));

    expect(pushMock).toHaveBeenCalledWith("/users/author/posts/saved-post");
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/workspace/history/item-1/seen", {
        method: "PUT",
      }),
    );
  });
});
