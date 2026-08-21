import { describe, expect, it } from "vitest";
import { ModerationService } from "../src/modules/moderation/service.js";

describe("ModerationService logic", () => {
  it("creates a report and prevents duplicate within 24h", async () => {
    let insertedValues: any = null;
    let queryCount = 0;

    const mockDb: any = {
      selectFrom: () => ({
        select: () => ({
          where: () => ({
            where: () => ({
              where: () => ({
                where: () => ({
                  executeTakeFirst: async () => {
                    queryCount++;
                    return queryCount > 1 ? { id: "existing-report" } : null;
                  },
                }),
              }),
            }),
          }),
        }),
      }),
      insertInto: () => ({
        values: (vals: any) => {
          insertedValues = vals;
          return {
            returning: () => ({
              executeTakeFirstOrThrow: async () => ({ id: "new-report-id" }),
            }),
          };
        },
      }),
    };

    const service = new ModerationService(mockDb);

    const first = await service.createReport("user-1", {
      targetType: "post",
      targetId: "post-123",
      reason: "Spam",
      details: "Spam links everywhere",
    });

    expect(first).toEqual({ id: "new-report-id", status: "pending" });
    expect(insertedValues).toMatchObject({
      reporter_id: "user-1",
      target_type: "post",
      target_id: "post-123",
      reason: "Spam",
      status: "pending",
    });

    await expect(
      service.createReport("user-1", {
        targetType: "post",
        targetId: "post-123",
        reason: "Spam",
      }),
    ).rejects.toMatchObject({
      code: "DUPLICATE_REPORT",
      statusCode: 429,
    });
  });
});
