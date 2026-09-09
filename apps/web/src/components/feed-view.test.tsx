// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SocialPost } from "@mycharacter/contracts";
import { FeedView } from "./feed-view";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/post-feed", () => ({
  PostFeed: () => <div>Post feed</div>,
}));

afterEach(cleanup);

describe("FeedView", () => {
  it("shows five popular authors and every subscription", () => {
    const popularAuthors = Array.from({ length: 5 }, (_, index) => ({
      id: `popular-${index}`,
      username: `popular-${index}`,
      displayName: null,
    }));
    const followingAuthors = Array.from({ length: 7 }, (_, index) => ({
      id: `following-${index}`,
      username: `following-${index}`,
      displayName: null,
    }));

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
        popularAuthors={popularAuthors}
        followingAuthors={followingAuthors}
      />,
    );

    expect(screen.getAllByText(/^@popular-/)).toHaveLength(5);
    expect(screen.getAllByText(/^@following-/)).toHaveLength(7);
    expect(screen.getByText("popularAuthors")).toBeVisible();
    expect(screen.getByText("subscriptions")).toBeVisible();
  });

  it("keeps the subscriptions section visible when it is empty", () => {
    render(
      <FeedView
        initialPosts={[] as SocialPost[]}
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
        popularAuthors={[]}
        followingAuthors={[]}
      />,
    );

    expect(screen.getByText("subscriptions")).toBeVisible();
    expect(screen.getByText("subscriptionsEmpty")).toBeVisible();
  });
});
