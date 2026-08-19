import { describe, expect, it } from "vitest";
import { TemplateReviewService } from "../src/modules/templates/review-service.js";

interface MockOptions {
  savedReviewId?: string;
  listedReviewIds?: string[];
}

function createMockDb(options: MockOptions = {}) {
  const savedReviewId = options.savedReviewId ?? "rev-1";
  const listedReviewIds = options.listedReviewIds ?? [savedReviewId];
  const insertedRows: any[] = [];
  const state: { updatedTemplate: any } = { updatedTemplate: null };

  const review = (id: string) => ({
    id,
    templateId: "tmpl-1",
    userId: "user-1",
    authorUsername: "player1",
    authorDisplayName: "Player One",
    rating: 5,
    title: "Great system!",
    body: "Very intuitive",
    createdAt: new Date("2026-08-01"),
    updatedAt: new Date("2026-08-01"),
  });

  const db: any = {
    selectFrom: (table: string) => {
      const chain: any = {
        innerJoin: () => chain,
        select: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        execute: async () => listedReviewIds.map(review),
        executeTakeFirstOrThrow: async () => review(savedReviewId),
        executeTakeFirst: async () => {
          if (table === "pdf_templates") {
            return {
              id: "tmpl-1",
              ownerId: "author-1",
              title: "D&D 5e Character Sheet",
              slug: "dnd-5e",
              ratingAvg: 5.0,
              ratingCount: 1,
            };
          }
          if (table === "template_reviews") {
            return { count: 1, avg: 5.0 };
          }
          return null;
        },
      };
      return chain;
    },
    insertInto: () => ({
      values: (vals: any) => {
        insertedRows.push(vals);
        return {
          execute: async () => ({}),
          onConflict: () => ({
            returning: () => ({
              executeTakeFirstOrThrow: async () => ({ id: savedReviewId }),
            }),
          }),
        };
      },
    }),
    updateTable: () => ({
      set: (vals: any) => {
        state.updatedTemplate = vals;
        return {
          where: () => ({
            execute: async () => ({}),
          }),
        };
      },
    }),
  };

  return { db, insertedRows, state };
}

const input = {
  rating: 5 as const,
  title: "Great system!",
  body: "Very intuitive",
};

describe("TemplateReviewService", () => {
  it("creates or updates review and recalculates rating stats", async () => {
    const { db, insertedRows, state } = createMockDb();

    const result = await new TemplateReviewService(db).addOrUpdateReview(
      "user-1",
      "tmpl-1",
      input,
    );

    expect(result.id).toBe("rev-1");
    expect(result.rating).toBe(5);
    expect(insertedRows[0].rating).toBe(5);
    expect(state.updatedTemplate).toMatchObject({
      rating_count: 1,
      rating_average: 5,
    });
  });

  // Reviews are listed newest-first and capped at 50, and an upsert leaves
  // created_at untouched. Updating an older review on a busy system therefore
  // saves a row that the listing never returns.
  it("returns the saved review even when it falls outside the listing window", async () => {
    const { db } = createMockDb({
      savedReviewId: "rev-old",
      listedReviewIds: ["rev-newer-1", "rev-newer-2"],
    });

    const result = await new TemplateReviewService(db).addOrUpdateReview(
      "user-1",
      "tmpl-1",
      input,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe("rev-old");
  });
});
