import { describe, expect, it } from "vitest";
import { moderatePostText } from "../src/modules/posts/auto-moderation.js";

describe("post auto-moderation", () => {
  it("allows ordinary tabletop combat descriptions", () => {
    expect(
      moderatePostText(
        "The orc attacks the paladin. Урон 8, после чего герой убивает дракона.",
      ),
    ).toBeNull();
  });

  it("rejects direct abusive phrases in English and Russian", () => {
    expect(moderatePostText("You should kill yourself")).toBe("abuse");
    expect(moderatePostText("Просто сдохни уже")).toBe("abuse");
  });

  it("rejects posts containing too many links", () => {
    expect(
      moderatePostText(
        [1, 2, 3, 4, 5].map((id) => `https://spam.test/${id}`).join(" "),
      ),
    ).toBe("link_spam");
  });
});
