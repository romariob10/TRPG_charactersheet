import type {
  ListNotificationsResponse,
  NotificationItem,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import { sql, type Kysely } from "kysely";

export interface CreateNotificationInput {
  userId: string;
  actorId?: string | null;
  type: string;
  targetType?: string | null;
  targetId?: string | null;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
}

export class NotificationService {
  private readonly db: Kysely<Database>;

  constructor(database: Kysely<Database>) {
    this.db = database;
  }

  async notify(input: CreateNotificationInput): Promise<void> {
    if (input.actorId && input.actorId === input.userId) {
      return;
    }

    await this.db
      .insertInto("user_notifications")
      .values({
        user_id: input.userId,
        actor_id: input.actorId ?? null,
        type: input.type,
        target_type: input.targetType ?? null,
        target_id: input.targetId ?? null,
        title: input.title,
        body: input.body ?? null,
        metadata: JSON.stringify(input.metadata ?? {}) as any,
      })
      .execute();
  }

  async list(userId: string, limit = 30): Promise<ListNotificationsResponse> {
    const rows = await this.db
      .selectFrom("user_notifications as n")
      .leftJoin("profiles as actor", "actor.id", "n.actor_id")
      .select([
        "n.id",
        "n.user_id as userId",
        "n.actor_id as actorId",
        "actor.username as actorUsername",
        "actor.display_name as actorDisplayName",
        "n.type",
        "n.target_type as targetType",
        "n.target_id as targetId",
        "n.title",
        "n.body",
        "n.metadata",
        "n.read_at as readAt",
        "n.created_at as createdAt",
      ])
      .where("n.user_id", "=", userId)
      .orderBy("n.created_at", "desc")
      .limit(Math.min(Math.max(limit, 1), 100))
      .execute();

    const unread = await this.db
      .selectFrom("user_notifications")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("user_id", "=", userId)
      .where("read_at", "is", null)
      .executeTakeFirst();

    const notifications: NotificationItem[] = rows.map((r) => {
      let meta: Record<string, unknown> = {};
      if (typeof r.metadata === "string") {
        try {
          meta = JSON.parse(r.metadata);
        } catch {}
      } else if (typeof r.metadata === "object" && r.metadata !== null) {
        meta = r.metadata as Record<string, unknown>;
      }

      return {
        id: String(r.id),
        userId: String(r.userId),
        actorId: r.actorId ? String(r.actorId) : null,
        actorUsername: r.actorUsername ?? null,
        actorDisplayName: r.actorDisplayName ?? null,
        type: r.type,
        targetType: r.targetType ?? null,
        targetId: r.targetId ?? null,
        title: r.title,
        body: r.body,
        metadata: meta,
        readAt: r.readAt ? new Date(r.readAt).toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      };
    });

    return {
      notifications,
      unreadCount: unread?.count ?? 0,
    };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.db
      .updateTable("user_notifications")
      .set({ read_at: new Date() })
      .where("id", "=", notificationId as any)
      .where("user_id", "=", userId)
      .execute();
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db
      .updateTable("user_notifications")
      .set({ read_at: new Date() })
      .where("user_id", "=", userId)
      .where("read_at", "is", null)
      .execute();
  }
}
