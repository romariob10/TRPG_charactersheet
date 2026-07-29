import type { Message } from "@ag-ui/client";

interface ToolCallLike {
  id?: unknown;
}

function getToolCalls(message: Message): ToolCallLike[] {
  const value = (message as unknown as { toolCalls?: unknown }).toolCalls;
  return Array.isArray(value) ? (value as ToolCallLike[]) : [];
}

function getToolCallId(message: Message) {
  const value = (message as unknown as { toolCallId?: unknown }).toolCallId;
  return typeof value === "string" ? value : null;
}

function hasContent(message: Message) {
  const content = (message as unknown as { content?: unknown }).content;
  if (typeof content === "string") return content.trim().length > 0;
  if (Array.isArray(content)) return content.length > 0;
  return content != null;
}

function messageText(message: Message) {
  const content = (message as unknown as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (
    content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const value = part as { type?: unknown; text?: unknown };
        return value.type === "text" && typeof value.text === "string"
          ? value.text
          : "";
      })
      .find(
        (text) => text.trim() && !text.trimStart().startsWith("<attachment"),
      ) ?? ""
  );
}

export function createAiThreadTitle(messages: Message[]) {
  const candidates = messages
    .filter((message) => message.role === "user")
    .map((message) =>
      messageText(message)
        .replace(/<attachment\b[\s\S]*$/i, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  if (candidates.length === 0) return null;

  const greeting =
    /^(?:ку|привет|здравствуй(?:те)?|добрый (?:день|вечер)|hello|hi|hey)[!.,\s]*$/i;
  const title =
    candidates.find(
      (candidate) => candidate.length >= 12 && !greeting.test(candidate),
    ) ??
    candidates.find((candidate) => !greeting.test(candidate)) ??
    candidates[0];
  return title.length > 72 ? `${title.slice(0, 69).trimEnd()}…` : title;
}

/**
 * Provider APIs require every assistant tool call to be followed by its tool
 * result. Batch inserts can share the same Postgres timestamp, so legacy rows
 * may load with the result before the call. Rebuild those pairs and discard
 * incomplete calls left behind by interrupted runs.
 */
export function repairToolMessageHistory(messages: Message[]): Message[] {
  const resultsByCallId = new Map<string, Message>();
  for (const message of messages) {
    if (message.role !== "tool") continue;
    const toolCallId = getToolCallId(message);
    if (toolCallId && !resultsByCallId.has(toolCallId)) {
      resultsByCallId.set(toolCallId, message);
    }
  }

  const repaired: Message[] = [];
  for (const message of messages) {
    if (message.role === "tool") continue;
    const toolCalls = getToolCalls(message);
    if (message.role !== "assistant" || toolCalls.length === 0) {
      repaired.push(message);
      continue;
    }

    const seenCallIds = new Set<string>();
    const completeToolCalls = toolCalls.filter((call) => {
      if (
        typeof call.id !== "string" ||
        seenCallIds.has(call.id) ||
        !resultsByCallId.has(call.id)
      )
        return false;
      seenCallIds.add(call.id);
      return true;
    });
    const messageWithoutToolCalls = {
      ...(message as unknown as Record<string, unknown>),
    };
    delete messageWithoutToolCalls.toolCalls;
    const repairedAssistant = (completeToolCalls.length > 0
      ? { ...messageWithoutToolCalls, toolCalls: completeToolCalls }
      : messageWithoutToolCalls) as unknown as Message;

    if (completeToolCalls.length > 0 || hasContent(repairedAssistant)) {
      repaired.push(repairedAssistant);
    }
    for (const call of completeToolCalls) {
      repaired.push(resultsByCallId.get(call.id as string)!);
    }
  }
  return repaired;
}

/**
 * AG-UI models every provider step around a tool call as a separate assistant
 * message. That shape is useful to the provider, but in chat it makes one
 * answer look like several unrelated answers (and renders a copy button for
 * every step). Keep the provider history intact and only collapse each
 * assistant/tool turn when sending messages to the UI.
 */
export function collapseAssistantToolTurnsForDisplay(
  messages: Message[],
): Message[] {
  const collapsed: Message[] = [];

  for (let index = 0; index < messages.length;) {
    const message = messages[index];
    if (message.role !== "assistant") {
      collapsed.push(message);
      index += 1;
      continue;
    }

    const turn: Message[] = [];
    while (
      index < messages.length &&
      (messages[index].role === "assistant" || messages[index].role === "tool")
    ) {
      turn.push(messages[index]);
      index += 1;
    }

    const assistantMessages = turn.filter((item) => item.role === "assistant");
    if (assistantMessages.length <= 1) {
      collapsed.push(...turn);
      continue;
    }

    const first = assistantMessages[0];
    const content = assistantMessages
      .map((item) =>
        typeof item.content === "string" ? item.content.trim() : "",
      )
      .filter(Boolean)
      .join("\n\n");
    const seenCallIds = new Set<string>();
    const toolCalls = assistantMessages.flatMap(getToolCalls).filter((call) => {
      if (typeof call.id !== "string" || seenCallIds.has(call.id)) return false;
      seenCallIds.add(call.id);
      return true;
    });
    const merged: Record<string, unknown> = {
      ...(first as unknown as Record<string, unknown>),
      content,
    };
    if (toolCalls.length > 0) merged.toolCalls = toolCalls;
    else delete merged.toolCalls;

    collapsed.push(
      merged as unknown as Message,
      ...turn.filter((item) => item.role === "tool"),
    );
  }

  return collapsed;
}
