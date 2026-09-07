import { describe, expect, it } from "vitest";
import {
  rankRecommendedPosts,
  type PostRecommendationSignals,
} from "../src/modules/posts/service.js";

const now = new Date("2026-08-31T12:00:00.000Z");

function post(
  values: Partial<PostRecommendationSignals> &
    Pick<PostRecommendationSignals, "id">,
): PostRecommendationSignals {
  return {
    authorId: `author-${values.id}`,
    publishedAt: new Date("2026-08-30T12:00:00.000Z"),
    commentCount: 0,
    viewsCount: 0,
    reactionCount: 0,
    followedByMeCount: 0,
    ...values,
  };
}

describe("post recommendations", () => {
  it("can rank an engaging post above the newest post", () => {
    const ranked = rankRecommendedPosts(
      [
        post({ id: "new", publishedAt: new Date("2026-08-31T11:00:00Z") }),
        post({ id: "engaging", reactionCount: 8, commentCount: 3 }),
      ],
      "viewer",
      now,
    );

    expect(ranked.map((item) => item.id)).toEqual(["engaging", "new"]);
  });

  it("boosts followed authors and keeps ties deterministic", () => {
    const ranked = rankRecommendedPosts(
      [
        post({ id: "b" }),
        post({ id: "followed", followedByMeCount: 1 }),
        post({ id: "a" }),
      ],
      "viewer",
      now,
    );

    expect(ranked.map((item) => item.id)).toEqual(["followed", "a", "b"]);
  });
});
