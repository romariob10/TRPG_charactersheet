import { describe, expect, it } from "vitest";
import { DirectMessageService } from "../src/modules/messages/service.js";

describe("DirectMessageService", () => {
  it("normalizes and retrieves or creates conversation", async () => {
    let inserted = false;
    const mockDb: any = {
      selectFrom: () => ({
        select: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => null,
            }),
          }),
        }),
      }),
      insertInto: () => ({
        values: () => ({
          onConflict: () => ({
            returning: () => ({
              executeTakeFirst: async () => ({ id: "conv-123" }),
            }),
          }),
        }),
      }),
    };

    const service = new DirectMessageService(mockDb);
    const convId = await service.getOrCreateConversation("user-b", "user-a");

    expect(convId).toBe("conv-123");
  });

  it("prevents self-conversations", async () => {
    const service = new DirectMessageService({} as any);
    await expect(service.getOrCreateConversation("user-1", "user-1")).rejects.toThrow();
  });
});
