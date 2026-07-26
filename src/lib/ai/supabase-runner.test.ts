import {
  EventType,
  type BaseEvent,
  type Message,
  type RunAgentInput,
} from "@ag-ui/client";
import type { AgentRunnerRunRequest } from "@copilotkit/runtime/v2";
import { describe, expect, it, vi } from "vitest";
import {
  coalesceAssistantRunEvent,
  SupabaseAgentRunner,
} from "@/lib/ai/supabase-runner";

describe("SupabaseAgentRunner attachments", () => {
  it("loads a saved conversation as soon as a thread connects", async () => {
    const saved = [
      { id: "saved", role: "user", content: "Продолжим" },
    ] as Message[];
    const runner = new SupabaseAgentRunner("character-id", "user-id");
    const runnerInternals = runner as unknown as {
      loadMessages: () => Promise<Message[]>;
    };
    runnerInternals.loadMessages = vi.fn().mockResolvedValue(saved);
    const events: BaseEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      runner.connect({ threadId: "saved-thread" }).subscribe({
        next: (event) => events.push(event),
        complete: resolve,
        error: reject,
      });
    });

    expect(events).toEqual([
      expect.objectContaining({
        type: EventType.RUN_STARTED,
        threadId: "saved-thread",
      }),
      { type: EventType.MESSAGES_SNAPSHOT, messages: saved },
      expect.objectContaining({
        type: EventType.RUN_FINISHED,
        threadId: "saved-thread",
      }),
    ]);
    expect((events[0] as { runId?: string }).runId).toBe(
      (events[2] as { runId?: string }).runId,
    );
  });

  it("replaces the agent's pre-seeded binary messages before running", async () => {
    const encoded = Buffer.from("Spell save DC: 15").toString("base64");
    const rawMessage = {
      id: "attachment-message",
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "data", value: encoded, mimeType: "text/plain" },
          metadata: { filename: "sheet.txt" },
        },
      ],
    } as Message;
    const runner = new SupabaseAgentRunner("character-id", "user-id");
    const runnerInternals = runner as unknown as {
      loadMessages: () => Promise<Message[]>;
      persistMessages: (
        threadId: string,
        displayMessages: Message[],
      ) => Promise<void>;
    };
    runnerInternals.loadMessages = vi.fn().mockResolvedValue([]);
    runnerInternals.persistMessages = vi.fn().mockResolvedValue(undefined);

    let modelInput: RunAgentInput | undefined;
    let agentMessages: Message[] = [rawMessage];
    const agent = {
      agentId: "character",
      messages: agentMessages,
      setMessages(messages: Message[]) {
        agentMessages = messages;
        this.messages = messages;
      },
      async runAgent(input: RunAgentInput) {
        modelInput = input;
      },
    };
    const input = {
      threadId: "thread-id",
      runId: "run-id",
      state: {},
      messages: [rawMessage],
      tools: [],
      context: [],
      forwardedProps: {},
    } as RunAgentInput;

    await new Promise<void>((resolve, reject) => {
      runner
        .run({
          threadId: "thread-id",
          agent,
          input,
        } as unknown as AgentRunnerRunRequest)
        .subscribe({ complete: resolve, error: reject });
    });

    expect(JSON.stringify(agentMessages)).toContain("Spell save DC: 15");
    expect(JSON.stringify(agentMessages)).not.toContain(encoded);
    expect(JSON.stringify(modelInput?.messages)).not.toContain(encoded);
    expect(modelInput?.messages[0]?.content).toEqual([
      expect.objectContaining({ type: "text" }),
    ]);
    expect(runnerInternals.persistMessages).toHaveBeenCalledWith("thread-id", [
      expect.objectContaining({
        content: [
          expect.objectContaining({
            type: "document",
            metadata: expect.objectContaining({ filename: "sheet.txt" }),
          }),
        ],
      }),
    ]);
  });

  it("uses saved history as authoritative and only appends new client messages", async () => {
    const saved = [
      { id: "saved-user", role: "user", content: "Заполни расу" },
      { id: "saved-assistant", role: "assistant", content: "Готово" },
    ] as Message[];
    const incoming = [
      ...saved,
      { id: "new-user", role: "user", content: "Теперь класс" },
    ] as Message[];
    const runner = new SupabaseAgentRunner("character-id", "user-id");
    const runnerInternals = runner as unknown as {
      loadMessages: () => Promise<Message[]>;
      persistMessages: () => Promise<void>;
    };
    runnerInternals.loadMessages = vi.fn().mockResolvedValue(saved);
    runnerInternals.persistMessages = vi.fn().mockResolvedValue(undefined);

    let modelInput: RunAgentInput | undefined;
    const agent = {
      agentId: "character",
      messages: incoming,
      setMessages(messages: Message[]) {
        this.messages = messages;
      },
      async runAgent(input: RunAgentInput) {
        modelInput = input;
      },
    };

    await new Promise<void>((resolve, reject) => {
      runner
        .run({
          threadId: "thread-id",
          agent,
          input: {
            threadId: "thread-id",
            runId: "run-id",
            state: {},
            messages: incoming,
            tools: [],
            context: [],
            forwardedProps: {},
          } as RunAgentInput,
        } as unknown as AgentRunnerRunRequest)
        .subscribe({ complete: resolve, error: reject });
    });

    expect(modelInput?.messages.map((message) => message.id)).toEqual([
      "saved-user",
      "saved-assistant",
      "new-user",
    ]);
  });
});

describe("SupabaseAgentRunner display stream", () => {
  it("keeps text and tool steps under one assistant message", () => {
    const state = {
      messageId: null as string | null,
      sourceMessageIds: new Set<string>(),
    };
    const events = [
      {
        type: EventType.TEXT_MESSAGE_START,
        role: "assistant",
        messageId: "first",
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: "first",
        delta: "Ищу",
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: "first",
      },
      {
        type: EventType.TOOL_CALL_START,
        parentMessageId: "first",
        toolCallId: "call",
        toolCallName: "searchFields",
      },
      {
        type: EventType.TEXT_MESSAGE_START,
        role: "assistant",
        messageId: "second",
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: "second",
        delta: "Готово",
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: "second",
      },
    ] as BaseEvent[];

    const result = events.map((event) =>
      coalesceAssistantRunEvent(event, state),
    );

    expect(result[0]).toMatchObject({ messageId: "first" });
    expect(result[1]).toMatchObject({ messageId: "first" });
    expect(result[2]).toMatchObject({ messageId: "first" });
    expect(result[3]).toMatchObject({ parentMessageId: "first" });
    expect(result[4]).toMatchObject({ messageId: "first" });
    expect(result[5]).toMatchObject({ messageId: "first" });
    expect(result[6]).toMatchObject({ messageId: "first" });

    const activeTextMessages = new Set<string>();
    for (const event of result) {
      const value = event as unknown as { messageId?: string };
      if (event.type === EventType.TEXT_MESSAGE_START && value.messageId) {
        expect(activeTextMessages.has(value.messageId)).toBe(false);
        activeTextMessages.add(value.messageId);
      }
      if (event.type === EventType.TEXT_MESSAGE_CONTENT && value.messageId) {
        expect(activeTextMessages.has(value.messageId)).toBe(true);
      }
      if (event.type === EventType.TEXT_MESSAGE_END && value.messageId) {
        expect(activeTextMessages.delete(value.messageId)).toBe(true);
      }
    }
    expect(activeTextMessages.size).toBe(0);
  });
});
