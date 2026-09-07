import { describe, expect, it } from "vitest";
import {
  DirectMessageService,
  resolveRollCommand,
} from "../src/modules/messages/service.js";

describe("resolveRollCommand", () => {
  it("returns a server-generated result from one through the requested maximum", () => {
    expect(resolveRollCommand("/roll 20", 1)).toBe("🎲 /roll 20 → 1");
    expect(resolveRollCommand("/ROLL 20", 20)).toBe(
      "🎲 /roll 20 → 20",
    );
  });

  it("leaves ordinary and unsupported commands unchanged", () => {
    expect(resolveRollCommand(" hello ", 1)).toBe("hello");
    expect(resolveRollCommand("/roll 0", 1)).toBe("/roll 0");
    expect(resolveRollCommand("/roll 1000001", 1)).toBe(
      "/roll 1000001",
    );
  });
});

describe("DirectMessageService", () => {
  it("normalizes and retrieves or creates conversation", async () => {
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
