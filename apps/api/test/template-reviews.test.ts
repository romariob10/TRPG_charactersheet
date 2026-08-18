import { describe, expect, it } from "vitest";
import { TemplateReviewService } from "../src/modules/templates/review-service.js";

describe("TemplateReviewService", () => {
  it("creates or updates review and recalculates rating stats", async () => {
    const insertedRows: any[] = [];
    let updatedTemplate: any = null;

    const mockDb: any = {
      selectFrom: (table: string) => {
        const chain: any = {
          innerJoin: () => chain,
          select: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: () => chain,
          execute: async () => [
            {
              id: "rev-1",
              templateId: "tmpl-1",
              userId: "user-1",
              authorUsername: "player1",
              authorDisplayName: "Player One",
              rating: 5,
              title: "Great system!",
              body: "Very intuitive",
              createdAt: new Date("2026-08-01"),
              updatedAt: new Date("2026-08-01"),
            },
          ],
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
                executeTakeFirstOrThrow: async () => ({ id: "rev-1" }),
              }),
            }),
          };
        },
      }),
      updateTable: () => ({
        set: (vals: any) => {
          updatedTemplate = vals;
          return {
            where: () => ({
              execute: async () => ({}),
            }),
          };
        },
      }),
    };

    const service = new TemplateReviewService(mockDb);
    const result = await service.addOrUpdateReview("user-1", "tmpl-1", {
      rating: 5,
      title: "Great system!",
      body: "Very intuitive",
    });

    expect(result.id).toBe("rev-1");
    expect(result.rating).toBe(5);
    expect(insertedRows[0].rating).toBe(5);
    expect(updatedTemplate).toMatchObject({
      rating_count: 1,
      rating_average: 5,
    });
  });
});
