import { describe, expect, it } from "vitest";
import { PostService } from "../src/modules/posts/service.js";

describe("PostService content lifecycle", () => {
  it("soft deletes a post by author", async () => {
    let updateSet: any = null;
    const mockDb: any = {
      selectFrom: () => ({
        select: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => ({ id: "post-1", authorId: "author-1" }),
            }),
          }),
        }),
      }),
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
    };

    const service = new PostService(mockDb);
    await service.delete("author-1", "post-1");
    expect(updateSet.deleted_at).toBeInstanceOf(Date);
  });
});
