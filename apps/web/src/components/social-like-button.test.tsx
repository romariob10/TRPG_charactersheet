// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/client";
import { LikeButton } from "./social-like-button";

vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} />
  ),
}));

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiClientError: class extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string,
    ) {
      super(message);
    }
  },
}));

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
});

describe("LikeButton", () => {
  it("toggles optimistically with aria-pressed", async () => {
    apiFetch.mockResolvedValue(undefined);
    render(
      <LikeButton
        templateId="t1"
        initialLiked={false}
        initialCount={3}
        authenticated
        likeLabel="Like"
        unlikeLabel="Unlike"
        signInLabel="Sign in to like"
      />,
    );
    const button = screen.getByRole("button", { name: "Like" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("4")).toBeInTheDocument();

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/templates/t1/like", {
        method: "PUT",
      }),
    );
  });

  it("rolls back when the request fails", async () => {
    apiFetch.mockRejectedValue(new ApiClientError("boom", 500));
    render(
      <LikeButton
        templateId="t1"
        initialLiked
        initialCount={2}
        authenticated
        likeLabel="Like"
        unlikeLabel="Unlike"
        signInLabel="Sign in to like"
      />,
    );
    const button = screen.getByRole("button", { name: "Unlike" });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("1")).toBeInTheDocument();

    await waitFor(() =>
      expect(button).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("links to sign-in for guests", () => {
    render(
      <LikeButton
        templateId="t1"
        initialLiked={false}
        initialCount={5}
        authenticated={false}
        likeLabel="Like"
        unlikeLabel="Unlike"
        signInLabel="Sign in to like"
      />,
    );
    const link = screen.getByRole("link", { name: "Like" });
    expect(link).toHaveAttribute("href", "/auth/sign-in");
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
