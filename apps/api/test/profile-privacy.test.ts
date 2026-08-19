import { describe, expect, it } from "vitest";
import { ProfileService } from "../src/modules/profiles/service.js";

describe("ProfileService privacy settings", () => {
  it("updates privacy settings and hides characters when disabled", async () => {
    let updateSet: any = null;
    const mockDb: any = {
      updateTable: () => ({
        set: (vals: any) => {
          updateSet = vals;
          return {
            where: () => ({
              execute: async () => ({}),
            }),
          };
        },
      }),
      selectFrom: (table: string) => {
        const chain: any = {
          innerJoin: () => chain,
          leftJoin: () => chain,
          select: () => chain,
          where: () => chain,
          whereRef: () => chain,
          orderBy: () => chain,
          execute: async () => [],
          executeTakeFirst: async () => {
            if (table.startsWith("profiles")) {
              return {
                id: "user-1",
                username: "alex",
                displayName: "Alex",
                bio: "Bio",
                joinedAt: new Date("2026-01-01"),
                allowComments: false,
                showCharacters: false,
                showTemplates: true,
                showActivity: false,
              };
            }
            return { count: 5 };
          },
        };
        return chain;
      },
    };

    const service = new ProfileService(mockDb);
    await service.updatePrivacySettings("user-1", {
      allowComments: false,
      showCharacters: false,
    });

    expect(updateSet).toMatchObject({
      allow_comments: false,
      show_characters: false,
    });

    const publicView = await service.getPublicProfile("alex", "other-user");
    expect(publicView.profile.allowComments).toBe(false);
    expect(publicView.profile.showCharacters).toBe(false);
    expect(publicView.characters).toEqual([]);
    expect(publicView.profile.followerCount).toBe(0);
  });
});
