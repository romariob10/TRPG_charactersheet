import type { Message } from "@ag-ui/client";
import type { Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { AppError } from "../../errors.js";
import {
  createAiThreadTitle,
  repairToolMessageHistory,
} from "./history.js";
import { restoreMessageAttachmentsForDisplay } from "./attachments.js";

/* eslint-disable no-unused-vars -- Interface parameter names document the repository contract. */
export interface AiMessageRepository {
  loadMessages(copilotThreadId: string): Promise<Message[]>;
  persistMessages(
    copilotThreadId: string,
    messages: Message[],
  ): Promise<void>;
}
/* eslint-enable no-unused-vars */

export class PostgresAiRepository implements AiMessageRepository {
  private readonly db: Kysely<Database>;
  private readonly characterId: string;
  private readonly userId: string;

  public constructor(
    db: Kysely<Database>,
    characterId: string,
    userId: string,
  ) {
    this.db = db;
    this.characterId = characterId;
    this.userId = userId;
  }

  async loadMessages(copilotThreadId: string): Promise<Message[]> {
    const thread = await this.findThread(copilotThreadId);
    if (!thread) return [];
    const rows = await this.db
      .selectFrom("ai_messages")
      .select("content")
      .where("thread_id", "=", thread.id)
      .orderBy("sequence_index")
      .orderBy("created_at")
      .orderBy("id")
      .execute();
    return repairToolMessageHistory(
      rows.map((row) =>
        restoreMessageAttachmentsForDisplay(row.content as Message),
      ),
    );
  }

  async persistMessages(
    copilotThreadId: string,
    messages: Message[],
  ): Promise<void> {
    if (messages.length === 0) return;
    const threadId = await this.ensureThread(copilotThreadId);
    await this.db.transaction().execute(async (trx) => {
      const messageIds = messages.map(
        (message, index) => message.id ?? `${copilotThreadId}-${index}`,
      );
      for (const [index, message] of messages.entries()) {
        await trx
          .insertInto("ai_messages")
          .values({
            thread_id: threadId,
            message_id: messageIds[index],
            role: message.role,
            content: JSON.stringify(message),
            sequence_index: index,
          })
          .onConflict((conflict) =>
            conflict.columns(["thread_id", "message_id"]).doUpdateSet({
              role: message.role,
              content: JSON.stringify(message),
              sequence_index: index,
            }),
          )
          .execute();
      }
      await trx
        .deleteFrom("ai_messages")
        .where("thread_id", "=", threadId)
        .where("message_id", "not in", messageIds)
        .execute();
      await trx
        .updateTable("ai_threads")
        .set({
          title: createAiThreadTitle(messages),
          updated_at: new Date(),
        })
        .where("id", "=", threadId)
        .execute();
    });
  }

  async listThreads() {
    const rows = await this.db
      .selectFrom("ai_threads")
      .select([
        "copilot_thread_id as id",
        "title",
        "created_at as createdAt",
        "updated_at as updatedAt",
      ])
      .where("character_id", "=", this.characterId)
      .where("user_id", "=", this.userId)
      .orderBy("updated_at", "desc")
      .limit(50)
      .execute();
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private findThread(copilotThreadId: string) {
    return this.db
      .selectFrom("ai_threads")
      .select("id")
      .where("character_id", "=", this.characterId)
      .where("user_id", "=", this.userId)
      .where("copilot_thread_id", "=", copilotThreadId)
      .executeTakeFirst();
  }

  private async ensureThread(copilotThreadId: string): Promise<string> {
    const existing = await this.findThread(copilotThreadId);
    if (existing) return existing.id;
    try {
      const created = await this.db
        .insertInto("ai_threads")
        .values({
          character_id: this.characterId,
          user_id: this.userId,
          copilot_thread_id: copilotThreadId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      return created.id;
    } catch {
      const concurrentlyCreated = await this.findThread(copilotThreadId);
      if (concurrentlyCreated) return concurrentlyCreated.id;
      throw new AppError(
        "AI_THREAD_CONFLICT",
        409,
        "This chat belongs to a different user or character.",
      );
    }
  }
}
