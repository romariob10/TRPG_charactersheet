import { EventType, type BaseEvent, type Message } from "@ag-ui/client";
import { randomUUID } from "node:crypto";
import {
  type AgentRunnerConnectRequest,
  AgentRunnerRunRequest,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { Observable, type Subscription } from "rxjs";
import {
  prepareMessageAttachments,
  restoreMessageAttachmentsForDisplay,
} from "./attachments.js";
import {
  collapseAssistantToolTurnsForDisplay,
  repairToolMessageHistory,
} from "./history.js";
import type { AiMessageRepository } from "./repository.js";

export class LocalAgentRunner extends InMemoryAgentRunner {
  private readonly repository: AiMessageRepository;

  constructor(repository: AiMessageRepository) {
    super();
    this.repository = repository;
  }

  private async persistMessages(
    copilotThreadId: string,
    displayInputMessages: Message[] = [],
  ) {
    const displayMessagesById = new Map(
      displayInputMessages
        .filter((message) => typeof message.id === "string")
        .map((message) => [message.id, message]),
    );
    const messages = this.getThreadMessages(copilotThreadId).map((message) =>
      message.role === "user" && typeof message.id === "string"
        ? (displayMessagesById.get(message.id) ??
          restoreMessageAttachmentsForDisplay(message))
        : message,
    );
    if (!messages.length) return;
    await this.repository.persistMessages(copilotThreadId, messages);
  }

  override connect(request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      let cancelled = false;
      void this.repository.loadMessages(request.threadId)
        .then((messages) => {
          if (cancelled) return;
          const runId = randomUUID();
          subscriber.next({
            type: EventType.RUN_STARTED,
            threadId: request.threadId,
            runId,
          });
          subscriber.next({
            type: EventType.MESSAGES_SNAPSHOT,
            messages: collapseAssistantToolTurnsForDisplay(messages),
          });
          subscriber.next({
            type: EventType.RUN_FINISHED,
            threadId: request.threadId,
            runId,
          });
          subscriber.complete();
        })
        .catch((error) => subscriber.error(error));
      return () => {
        cancelled = true;
      };
    });
  }

  override run(request: AgentRunnerRunRequest): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      let subscription: Subscription | undefined;
      let cancelled = false;
      void this.repository.loadMessages(request.threadId)
        .then(async (messages) => {
          if (cancelled) return;
          const incomingMessages = request.input.messages ?? [];
          const persistedIds = new Set(messages.map((message) => message.id));
          const preparedMessages = await Promise.all(
            [
              ...messages,
              ...incomingMessages.filter(
                (message) => !persistedIds.has(message.id),
              ),
            ].map(prepareMessageAttachments),
          );
          const mergedMessages = repairToolMessageHistory(
            preparedMessages.map((prepared) => prepared.providerMessage),
          );
          const displayMessages = repairToolMessageHistory(
            preparedMessages.map((prepared) => prepared.displayMessage),
          );
          // CopilotKit seeds the cloned agent with the raw request messages before
          // invoking the runner. Keep the agent state in sync with the normalized
          // input so provider adapters cannot re-introduce binary `file` parts.
          request.agent.setMessages(mergedMessages);
          const displayState: AssistantDisplayStreamState = {
            messageId: null,
            sourceMessageIds: new Set(),
          };
          subscription = super
            .run({
              ...request,
              input: { ...request.input, messages: mergedMessages },
              persistedInputMessages: mergedMessages,
            })
            .subscribe({
              next: (event) =>
                subscriber.next(coalesceAssistantRunEvent(event, displayState)),
              error: (error) => subscriber.error(error),
              complete: () => {
                void this.persistMessages(
                  request.threadId,
                  displayMessages,
                ).then(
                  () => subscriber.complete(),
                  (error) => subscriber.error(error),
                );
              },
            });
        })
        .catch((error) => subscriber.error(error));
      return () => {
        cancelled = true;
        subscription?.unsubscribe();
      };
    });
  }
}

export function coalesceAssistantRunEvent(
  event: BaseEvent,
  state: AssistantDisplayStreamState,
): BaseEvent {
  const value = event as unknown as Record<string, unknown>;
  if (
    event.type === EventType.TOOL_CALL_START &&
    typeof value.parentMessageId === "string"
  ) {
    state.messageId ??= value.parentMessageId;
    return {
      ...value,
      parentMessageId: state.messageId,
    } as unknown as BaseEvent;
  }
  if (
    (event.type === EventType.TEXT_MESSAGE_START ||
      event.type === EventType.TEXT_MESSAGE_CHUNK) &&
    value.role === "assistant" &&
    typeof value.messageId === "string"
  ) {
    state.messageId ??= value.messageId;
    state.sourceMessageIds.add(value.messageId);
    return { ...value, messageId: state.messageId } as unknown as BaseEvent;
  }
  if (
    (event.type === EventType.TEXT_MESSAGE_CONTENT ||
      event.type === EventType.TEXT_MESSAGE_END) &&
    typeof value.messageId === "string" &&
    state.sourceMessageIds.has(value.messageId) &&
    state.messageId
  ) {
    return { ...value, messageId: state.messageId } as unknown as BaseEvent;
  }
  return event;
}

interface AssistantDisplayStreamState {
  messageId: string | null;
  sourceMessageIds: Set<string>;
}
