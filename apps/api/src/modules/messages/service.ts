import type {
  DirectConversationSummary,
  DirectMessage,
  ListConversationsResponse,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import { sql, type Kysely } from "kysely";
import { AppError } from "../../errors.js";
import { UserModerationService } from "../moderation/user-moderation-service.js";
import { NotificationService } from "../notifications/service.js";
import { WorkspaceService } from "../workspace/service.js";

export class DirectMessageService {
  private readonly db: Kysely<Database>;

  constructor(database: Kysely<Database>) {
    this.db = database;
  }

  private normalizeParticipants(userA: string, userB: string): [string, string] {
    if (userA === userB) {
      throw new AppError("SELF_CONVERSATION", 400, "You cannot send messages to yourself.");
    }
    return userA < userB ? [userA, userB] : [userB, userA];
  }

  async getOrCreateConversation(userA: string, userB: string): Promise<string> {
    const [p1, p2] = this.normalizeParticipants(userA, userB);

    const existing = await this.db
      .selectFrom("direct_conversations")
      .select("id")
      .where("participant_one_id", "=", p1)
      .where("participant_two_id", "=", p2)
      .executeTakeFirst();

    if (existing) {
      return String(existing.id);
    }

    const created = await this.db
      .insertInto("direct_conversations")
      .values({
        participant_one_id: p1,
        participant_two_id: p2,
        last_message_at: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(["participant_one_id", "participant_two_id"]).doNothing(),
      )
      .returning("id")
      .executeTakeFirst();

    if (created) {
      return String(created.id);
    }

    const recheck = await this.db
      .selectFrom("direct_conversations")
      .select("id")
      .where("participant_one_id", "=", p1)
      .where("participant_two_id", "=", p2)
      .executeTakeFirstOrThrow();

    return String(recheck.id);
  }

  async listConversations(userId: string): Promise<ListConversationsResponse> {
    const rows = await this.db
      .selectFrom("direct_conversations as c")
      .leftJoin("profiles as p1", "p1.id", "c.participant_one_id")
      .leftJoin("profiles as p2", "p2.id", "c.participant_two_id")
      .select([
        "c.id",
        "c.participant_one_id as p1Id",
        "p1.username as p1Username",
        "p1.display_name as p1DisplayName",
        "c.participant_two_id as p2Id",
        "p2.username as p2Username",
        "p2.display_name as p2DisplayName",
        "c.last_message_at as lastMessageAt",
      ])
      .where((eb) =>
        eb.or([
          eb("c.participant_one_id", "=", userId),
          eb("c.participant_two_id", "=", userId),
        ]),
      )
      .orderBy("c.last_message_at", "desc")
      .limit(50)
      .execute();

    const summaries: DirectConversationSummary[] = [];

    for (const row of rows) {
      const isP1 = row.p1Id === userId;
      const otherId = isP1 ? row.p2Id : row.p1Id;
      const otherUsername = isP1 ? row.p2Username : row.p1Username;
      const otherDisplayName = isP1 ? row.p2DisplayName : row.p1DisplayName;

      const lastMsg = await this.db
        .selectFrom("direct_messages")
        .select(["body", "sender_id as senderId", "created_at as createdAt", "read_at as readAt"])
        .where("conversation_id", "=", row.id)
        .orderBy("created_at", "desc")
        .limit(1)
        .executeTakeFirst();

      const unread = await this.db
        .selectFrom("direct_messages")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("conversation_id", "=", row.id)
        .where("sender_id", "!=", userId)
        .where("read_at", "is", null)
        .executeTakeFirst();

      summaries.push({
        id: String(row.id),
        participant: {
          id: String(otherId),
          username: otherUsername ?? "anonymous",
          displayName: otherDisplayName ?? null,
        },
        lastMessage: lastMsg
          ? {
              body: lastMsg.body,
              senderId: String(lastMsg.senderId),
              createdAt: lastMsg.createdAt.toISOString(),
              readAt: lastMsg.readAt ? new Date(lastMsg.readAt).toISOString() : null,
            }
          : null,
        unreadCount: unread?.count ?? 0,
        lastMessageAt: row.lastMessageAt.toISOString(),
      });
    }

    return { conversations: summaries };
  }

  async getMessages(
    userId: string,
    conversationId: string,
    limit = 100,
  ): Promise<DirectMessage[]> {
    const conv = await this.db
      .selectFrom("direct_conversations")
      .select(["id", "participant_one_id as p1", "participant_two_id as p2"])
      .where("id", "=", conversationId)
      .executeTakeFirst();

    if (!conv || (conv.p1 !== userId && conv.p2 !== userId)) {
      throw new AppError("CONVERSATION_NOT_FOUND", 404, "Conversation not found.");
    }

    // Mark unread messages from the other user as read
    await this.db
      .updateTable("direct_messages")
      .set({ read_at: new Date() })
      .where("conversation_id", "=", conversationId)
      .where("sender_id", "!=", userId)
      .where("read_at", "is", null)
      .execute();

    const rows = await this.db
      .selectFrom("direct_messages")
      .select(["id", "conversation_id as conversationId", "sender_id as senderId", "body", "read_at as readAt", "created_at as createdAt"])
      .where("conversation_id", "=", conversationId)
      .orderBy("created_at", "asc")
      .limit(Math.min(Math.max(limit, 1), 200))
      .execute();

    return rows.map((r) => ({
      id: String(r.id),
      conversationId: String(r.conversationId),
      senderId: String(r.senderId),
      body: r.body,
      readAt: r.readAt ? new Date(r.readAt).toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      isMine: r.senderId === userId,
    }));
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    body: string,
  ): Promise<DirectMessage> {
    await new UserModerationService(this.db).assertCanPost(userId);

    const conv = await this.db
      .selectFrom("direct_conversations")
      .select(["id", "participant_one_id as p1", "participant_two_id as p2"])
      .where("id", "=", conversationId)
      .executeTakeFirst();

    if (!conv || (conv.p1 !== userId && conv.p2 !== userId)) {
      throw new AppError("CONVERSATION_NOT_FOUND", 404, "Conversation not found.");
    }

    const recipientId = conv.p1 === userId ? conv.p2 : conv.p1;

    const row = await this.db
      .insertInto("direct_messages")
      .values({
        conversation_id: conversationId,
        sender_id: userId,
        body: body.trim(),
      })
      .returning(["id", "conversation_id as conversationId", "sender_id as senderId", "body", "read_at as readAt", "created_at as createdAt"])
      .executeTakeFirstOrThrow();

    await this.db
      .updateTable("direct_conversations")
      .set({ last_message_at: new Date() })
      .where("id", "=", conversationId)
      .execute();

    await new NotificationService(this.db).notify({
      userId: recipientId,
      actorId: userId,
      type: "direct_message",
      targetType: "conversation",
      targetId: conversationId,
      title: "New private message",
      body: body.trim().slice(0, 100),
      metadata: { conversationId },
    });

    const workspace = new WorkspaceService(this.db);
    await workspace.recordActivity(userId, "conversation", conversationId, {
      markSeen: true,
    });
    await workspace.recordActivity(recipientId, "conversation", conversationId);

    return {
      id: String(row.id),
      conversationId: String(row.conversationId),
      senderId: String(row.senderId),
      body: row.body,
      readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      isMine: true,
    };
  }
}
