import type { Message } from "@ag-ui/client";
import { describe, expect, it } from "vitest";
import {
  collapseAssistantToolTurnsForDisplay,
  createAiThreadTitle,
  repairToolMessageHistory,
} from "../src/modules/ai/history.js";

describe("AI tool history repair", () => {
  it("moves a tool result directly after its assistant call", () => {
    const callId = "call-out-of-order";
    const result = {
      id: "result",
      role: "tool",
      toolCallId: callId,
      content: "ok",
    } as Message;
    const call = {
      id: "call",
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: callId,
          type: "function",
          function: { name: "searchFields", arguments: "{}" },
        },
      ],
    } as Message;
    const user = { id: "user", role: "user", content: "continue" } as Message;

    expect(repairToolMessageHistory([result, call, user])).toEqual([
      call,
      result,
      user,
    ]);
  });

  it("removes incomplete calls and orphan tool results", () => {
    const missingCallId = "call-missing-result";
    const orphanResult = {
      id: "orphan",
      role: "tool",
      toolCallId: "unknown",
      content: "unused",
    } as Message;
    const incompleteCall = {
      id: "incomplete",
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: missingCallId,
          type: "function",
          function: { name: "searchFields", arguments: "{}" },
        },
      ],
    } as Message;
    const user = { id: "user", role: "user", content: "retry" } as Message;

    expect(
      repairToolMessageHistory([incompleteCall, orphanResult, user]),
    ).toEqual([user]);
  });
});

describe("AI chat display history", () => {
  it("renders a multi-step tool run as one assistant response", () => {
    const messages = [
      { id: "user", role: "user", content: "Заполни расу" },
      {
        id: "assistant-first",
        role: "assistant",
        content: "Ищу поле",
        toolCalls: [{ id: "call-1" }],
      },
      { id: "result-1", role: "tool", toolCallId: "call-1", content: "found" },
      {
        id: "assistant-second",
        role: "assistant",
        content: "Проверяю значение",
        toolCalls: [{ id: "call-2" }],
      },
      { id: "result-2", role: "tool", toolCallId: "call-2", content: "empty" },
      {
        id: "assistant-final",
        role: "assistant",
        content: "Предложение готово",
      },
    ] as Message[];

    const result = collapseAssistantToolTurnsForDisplay(messages);

    expect(result).toHaveLength(4);
    expect(result[1]).toMatchObject({
      id: "assistant-first",
      role: "assistant",
      content: "Ищу поле\n\nПроверяю значение\n\nПредложение готово",
      toolCalls: [{ id: "call-1" }, { id: "call-2" }],
    });
    expect(result.slice(2).map((message) => message.role)).toEqual([
      "tool",
      "tool",
    ]);
  });
});

describe("AI thread titles", () => {
  it("uses the first user text and collapses whitespace", () => {
    const messages = [
      {
        id: "first",
        role: "user",
        content: [{ type: "text", text: "  Заполни\n\nкласс персонажа  " }],
      },
      { id: "answer", role: "assistant", content: "Хорошо" },
    ] as Message[];

    expect(createAiThreadTitle(messages)).toBe("Заполни класс персонажа");
  });

  it("uses the first meaningful request instead of a greeting", () => {
    const messages = [
      { id: "hello", role: "user", content: "Ку" },
      { id: "hello-answer", role: "assistant", content: "Привет!" },
      { id: "request", role: "user", content: "Поставь расу Человек" },
    ] as Message[];

    expect(createAiThreadTitle(messages)).toBe("Поставь расу Человек");
  });

  it("does not include serialized attachment data in a title", () => {
    const messages = [
      { id: "hello", role: "user", content: "Привет" },
      {
        id: "request",
        role: "user",
        content:
          'Перенеси персонажа <attachment name="sheet.pdf">binary content</attachment>',
      },
    ] as Message[];

    expect(createAiThreadTitle(messages)).toBe("Перенеси персонажа");
  });
});
