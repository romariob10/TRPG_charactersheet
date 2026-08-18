import { describe, expect, it } from "vitest";
import { NotificationService } from "../src/modules/notifications/service.js";

describe("NotificationService", () => {
  it("skips notification when actor is the same as recipient", async () => {
    let inserted = false;
    const mockDb: any = {
      insertInto: () => {
        inserted = true;
        return { values: () => ({ execute: async () => ({}) }) };
      },
    };

    const service = new NotificationService(mockDb);
    await service.notify({
      userId: "user-1",
      actorId: "user-1",
      type: "post_reaction",
      title: "Self reaction",
    });

    expect(inserted).toBe(false);
  });

  it("lists notifications and counts unread", async () => {
    const mockDb: any = {
      selectFrom: (table: string) => {
        const chain: any = {
          leftJoin: () => chain,
          select: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: () => chain,
          execute: async () => [
            {
              id: "notif-1",
              userId: "user-1",
              actorId: "actor-1",
              actorUsername: "bob",
              actorDisplayName: "Bob",
              type: "follow",
              targetType: "user",
              targetId: "actor-1",
              title: "New follower",
              body: "started following your profile",
              metadata: {},
              readAt: null,
              createdAt: new Date("2026-08-01"),
            },
          ],
          executeTakeFirst: async () => ({ count: 1 }),
        };
        return chain;
      },
    };

    const service = new NotificationService(mockDb);
    const result = await service.list("user-1");

    expect(result.unreadCount).toBe(1);
    expect(result.notifications.length).toBe(1);
    expect(result.notifications[0].title).toBe("New follower");
  });
});
