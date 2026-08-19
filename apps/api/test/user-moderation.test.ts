import { describe, expect, it } from "vitest";
import { UserModerationService } from "../src/modules/moderation/user-moderation-service.js";

describe("UserModerationService", () => {
  const moderatorActor = {
    userId: "00000000-0000-4000-8000-000000000001",
    sessionId: "00000000-0000-4000-8000-000000000002",
    role: "moderator" as const,
    isAdmin: false,
  };

  it("blocks moderator from moderating an admin", async () => {
    const mockDb: any = {
      selectFrom: () => ({
        innerJoin: () => ({
          select: () => ({
            where: () => ({
              executeTakeFirst: async () => ({
                id: "admin-user",
                siteRole: "admin",
                isAdmin: true,
                status: "active",
              }),
            }),
          }),
        }),
      }),
    };

    const service = new UserModerationService(mockDb);

    await expect(
      service.moderateUser(moderatorActor, "admin-user", {
        action: "ban",
        reason: "Violation",
      }),
    ).rejects.toMatchObject({
      code: "CANNOT_MODERATE_ADMIN",
      statusCode: 403,
    });
  });

  it("assertCanPost throws when user has active mute_posts restriction", async () => {
    const mockDb: any = {
      selectFrom: () => ({
        select: () => ({
          where: () => ({
            where: () => ({
              where: () => ({
                where: () => ({
                  executeTakeFirst: async () => ({
                    id: "restriction-1",
                    action: "mute_posts",
                    reason: "Spamming feed",
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const service = new UserModerationService(mockDb);

    await expect(service.assertCanPost("user-1")).rejects.toMatchObject({
      code: "USER_RESTRICTED",
      statusCode: 403,
    });
  });
});
