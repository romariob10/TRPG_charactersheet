// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SocialPost } from "@mycharacter/contracts";
import { collectFeedAuthors, FeedView } from "./feed-view";

const { refreshedPosts } = vi.hoisted(() => ({
  refreshedPosts: [] as SocialPost[],
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/post-feed", () => ({
  PostFeed: ({
    onPostsChange,
  }: {
    onPostsChange?: (posts: SocialPost[]) => void;
  }) => (
    <button type="button" onClick={() => onPostsChange?.(refreshedPosts)}>
      Refresh feed
    </button>
  ),
}));

afterEach(cleanup);

function post(author: SocialPost["author"]): Pick<SocialPost, "author"> {
  return { author };
}

describe("FeedView", () => {
  it("deduplicates all authors, including the current user", () => {
    const current = { id: "current", username: "current", displayName: null };
    const alice = { id: "alice", username: "alice", displayName: "Alice" };
    const bob = { id: "bob", username: "bob", displayName: null };

    expect(
      collectFeedAuthors(
        [post(current), post(alice), post(alice), post(bob)],
      ),
    ).toEqual([current, alice, bob]);
  });

  it("updates the author list when the client feed refreshes", () => {
    const alice = { id: "alice", username: "alice", displayName: "Alice" };
    const bob = { id: "bob", username: "bob", displayName: "Bob" };
    refreshedPosts.splice(
      0,
      refreshedPosts.length,
      post(alice) as SocialPost,
      post(bob) as SocialPost,
    );

    render(
      <FeedView
        initialPosts={[]}
        profile={{
          id: "current",
          email: "current@example.com",
          username: "current",
          displayName: null,
          bio: "",
          isAdmin: false,
          siteRole: "user",
        }}
        embedOptions={{ characters: [], systems: [] }}
        locale="ru"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh feed" }));

    expect(screen.getByText("@alice")).toBeVisible();
    expect(screen.getByText("@bob")).toBeVisible();
  });
});
