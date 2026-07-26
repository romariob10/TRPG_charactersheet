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
} from "@/lib/ai/attachments";
import {
  collapseAssistantToolTurnsForDisplay,
  createAiThreadTitle,
  repairToolMessageHistory,
} from "@/lib/ai/history";
import { createAdminClient } from "@/lib/supabase/admin";

export class SupabaseAgentRunner extends InMemoryAgentRunner {
  constructor(
    private readonly characterId: string,
    private readonly userId: string,
  ) {
    super();
  }

  private async ensureThread(copilotThreadId: string) {
    const admin = createAdminClient();
    const findThread = () =>
      admin
        .from("ai_threads")
        .select("id")
        .eq("character_id", this.characterId)
        .eq("user_id", this.userId)
        .eq("copilot_thread_id", copilotThreadId)
        .maybeSingle();
    const { data: existing, error: findError } = await findThread();
    if (findError) throw findError;
    if (existing) return existing.id as string;

    const { data, error } = await admin
      .from("ai_threads")
      .insert({
        character_id: this.characterId,
        user_id: this.userId,
        copilot_thread_id: copilotThreadId,
      })
      .select("id")
      .single();
    if (error) {
      const { data: concurrentlyCreated, error: retryError } =
        await findThread();
      if (retryError || !concurrentlyCreated) throw error;
      return concurrentlyCreated.id as string;
    }
    return data.id as string;
  }

  private async loadMessages(copilotThreadId: string): Promise<Message[]> {
    const admin = createAdminClient();
    const { data: thread, error: threadError } = await admin
      .from("ai_threads")
      .select("id")
      .eq("character_id", this.characterId)
      .eq("user_id", this.userId)
      .eq("copilot_thread_id", copilotThreadId)
      .maybeSingle();
    if (threadError) throw threadError;
    if (!thread) return [];
    const { data, error } = await admin
      .from("ai_messages")
      .select("content")
      .eq("thread_id", thread.id)
      .order("sequence_index")
      .order("created_at")
      .order("id");
    if (error) throw error;
    return repairToolMessageHistory(
      (data ?? []).map((row) =>
        restoreMessageAttachmentsForDisplay(row.content as Message),
      ),
    );
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
    const threadId = await this.ensureThread(copilotThreadId);
    const admin = createAdminClient();
    const rows = messages.map((message, index) => ({
      thread_id: threadId,
      message_id: message.id ?? `${copilotThreadId}-${index}`,
      role: message.role,
      content: message,
      sequence_index: index,
    }));
    const { error } = await admin
      .from("ai_messages")
      .upsert(rows, { onConflict: "thread_id,message_id" });
    if (error) throw error;
    const { data: storedRows, error: storedRowsError } = await admin
      .from("ai_messages")
      .select("message_id")
      .eq("thread_id", threadId);
    if (storedRowsError) throw storedRowsError;
    const currentIds = new Set(rows.map((row) => row.message_id));
    const staleIds = (storedRows ?? [])
      .map((row) => row.message_id as string)
      .filter((messageId) => !currentIds.has(messageId));
    if (staleIds.length > 0) {
      const { error: deleteError } = await admin
        .from("ai_messages")
        .delete()
        .eq("thread_id", threadId)
        .in("message_id", staleIds);
      if (deleteError) throw deleteError;
    }
    const { error: updateError } = await admin
      .from("ai_threads")
      .update({
        title: createAiThreadTitle(messages),
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId);
    if (updateError) throw updateError;
  }

  override connect(request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      let cancelled = false;
      void this.loadMessages(request.threadId)
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
      void this.loadMessages(request.threadId)
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
                ).finally(() => subscriber.complete());
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
