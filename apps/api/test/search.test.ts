import { describe, expect, it } from "vitest";
import { SearchService } from "../src/modules/search/service.js";

describe("SearchService", () => {
  it("searches and formats results with relevance ranking", async () => {
    const createChain = (data: any[]) => {
      const chain: any = {
        innerJoin: () => chain,
        leftJoin: () => chain,
        select: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        execute: async () => data,
      };
      return chain;
    };

    const mockDb: any = {
      selectFrom: (table: string) => {
        if (table.startsWith("posts")) {
          return createChain([
            {
              id: "p1",
              slug: "my-first-post",
              title: "D&D Campaign Session 1",
              plainText: "We fought goblins",
              publishedAt: new Date("2026-08-01"),
              authorId: "u1",
              authorUsername: "dungeonmaster",
              authorDisplayName: "DM",
            },
          ]);
        }
        return createChain([]);
      },
    };

    const service = new SearchService(mockDb);
    const res = await service.search({ q: "D&D", type: "all", limit: 20 });

    expect(res.query).toBe("D&D");
    expect(res.results.length).toBe(1);
    expect(res.results[0]).toMatchObject({
      id: "p1",
      type: "post",
      title: "D&D Campaign Session 1",
      url: "/users/dungeonmaster/posts/my-first-post",
    });
  });
});
