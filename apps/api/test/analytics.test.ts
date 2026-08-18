import { describe, expect, it } from "vitest";
import { AnalyticsService } from "../src/modules/admin/analytics-service.js";

describe("AnalyticsService", () => {
  it("computes aggregate counts and time-series points", async () => {
    const mockDb: any = {
      selectFrom: (table: string) => {
        const chain: any = {
          select: (sel: any) => {
            return chain;
          },
          where: () => chain,
          groupBy: () => chain,
          orderBy: () => chain,
          executeTakeFirst: async () => ({ count: 42 }),
          execute: async () => [
            { date: "2026-08-01", count: 10 },
            { date: "2026-08-02", count: 15 },
          ],
        };
        return chain;
      },
    };

    const service = new AnalyticsService(mockDb);
    const summary = await service.getSummary("7d");

    expect(summary.period).toBe("7d");
    expect(summary.totalUsers).toBe(42);
    expect(summary.userGrowth.length).toBe(2);
    expect(summary.userGrowth[0]).toEqual({ date: "2026-08-01", count: 10 });
  });
});
