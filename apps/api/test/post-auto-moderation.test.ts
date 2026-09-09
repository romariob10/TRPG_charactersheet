import { describe, expect, it, vi } from "vitest";
import {
  moderatePostContent,
  moderatePostText,
} from "../src/modules/posts/auto-moderation.js";

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

  it("rejects explicit profanity including separated letters", () => {
    expect(moderatePostText("хуй")).toBe("profanity");
    expect(moderatePostText("х.у.й")).toBe("profanity");
  });

  it("rejects posts containing too many links", () => {
    expect(
      moderatePostText(
        [1, 2, 3, 4, 5].map((id) => `https://spam.test/${id}`).join(" "),
      ),
    ).toBe("link_spam");
  });

  it("rejects obvious off-topic promotion without an AI request", async () => {
    const classifyTopic = vi.fn();

    await expect(
      moderatePostContent("Получайте лучшие сигналы по криптовалюте", {
        classifyTopic,
      }),
    ).resolves.toBe("off_topic");
    expect(classifyTopic).not.toHaveBeenCalled();
  });

  it("uses topic classification only when local context is inconclusive", async () => {
    const classifyTopic = vi.fn().mockResolvedValue({
      verdict: "unrelated" as const,
      confidence: 0.96,
    });

    await expect(
      moderatePostContent("Сегодня поменял масло в машине", { classifyTopic }),
    ).resolves.toBe("off_topic");
    expect(classifyTopic).toHaveBeenCalledOnce();
  });

  it("allows uncertain posts and obvious tabletop discussion", async () => {
    const classifyTopic = vi.fn().mockResolvedValue({
      verdict: "uncertain" as const,
      confidence: 0.9,
    });

    await expect(
      moderatePostContent("Кто сегодня свободен?", { classifyTopic }),
    ).resolves.toBeNull();
    await expect(
      moderatePostContent("Ищу игроков на D&D one-shot", { classifyTopic }),
    ).resolves.toBeNull();
    expect(classifyTopic).toHaveBeenCalledOnce();
  });

  it("fails open and reports an unavailable topic classifier", async () => {
    const error = new Error("provider unavailable");
    const onClassifierError = vi.fn();

    await expect(
      moderatePostContent("Нейтральный короткий текст", {
        classifyTopic: async () => {
          throw error;
        },
        onClassifierError,
      }),
    ).resolves.toBeNull();
    expect(onClassifierError).toHaveBeenCalledWith(error);
  });
});
