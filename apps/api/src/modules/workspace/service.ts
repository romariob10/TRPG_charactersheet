import type {
  ListWorkspaceHistoryResponse,
  WorkspaceItem,
  WorkspaceItemKind,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import { sql, type Kysely, type Transaction } from "kysely";

const HISTORY_LIMIT = 30;

interface DisplayInfo {
  title: string | null;
  subtitle: string | null;
  url: string | null;
}

export class WorkspaceService {
  private readonly db: Kysely<Database> | Transaction<Database>;

  constructor(database: Kysely<Database> | Transaction<Database>) {
    this.db = database;
  }

  // Records that something happened to a target so it surfaces in the owner's
  // history. Bumps last_activity_at; markSeen also stamps last_seen_at so the
  // actor who caused the activity does not see their own action as unread.
  async recordActivity(
    userId: string,
    kind: WorkspaceItemKind,
    targetId: string,
    options: { markSeen?: boolean } = {},
  ): Promise<void> {
    const at = new Date();
    const seen = options.markSeen === true;
    await this.db
      .insertInto("workspace_items")
      .values({
        user_id: userId,
        kind,
        target_id: targetId,
        last_activity_at: at,
        last_seen_at: seen ? at : null,
      })
      .onConflict((conflict) =>
        conflict
          .columns(["user_id", "kind", "target_id"])
          .doUpdateSet(
            seen
              ? { last_activity_at: at, last_seen_at: at }
              : { last_activity_at: at },
          ),
      )
      .execute();
  }

  async list(userId: string): Promise<ListWorkspaceHistoryResponse> {
    const rows = await this.db
      .selectFrom("workspace_items")
      .select([
        "id",
        "kind",
        "target_id as targetId",
        "pinned",
        "last_activity_at as lastActivityAt",
        "last_seen_at as lastSeenAt",
      ])
      .where("user_id", "=", userId)
      .orderBy("pinned", "desc")
      .orderBy("last_activity_at", "desc")
      .limit(HISTORY_LIMIT)
      .execute();

    if (rows.length === 0) {
      return { items: [] };
    }

    const byKind: Record<WorkspaceItemKind, string[]> = {
      post: [],
      conversation: [],
      character: [],
      system: [],
    };
    for (const row of rows) {
      if (row.kind in byKind) {
        byKind[row.kind as WorkspaceItemKind].push(String(row.targetId));
      }
    }

    const [posts, conversations, characters, systems] = await Promise.all([
      this.postDetails(byKind.post),
      this.conversationDetails(userId, byKind.conversation),
      this.characterDetails(byKind.character),
      this.systemDetails(byKind.system),
    ]);

    const details: Record<string, DisplayInfo | undefined> = {};
    for (const [id, info] of posts) details[`post:${id}`] = info;
    for (const [id, info] of conversations)
      details[`conversation:${id}`] = info;
    for (const [id, info] of characters) details[`character:${id}`] = info;
    for (const [id, info] of systems) details[`system:${id}`] = info;

    const items: WorkspaceItem[] = rows.map((row) => {
      const info = details[`${row.kind}:${row.targetId}`];
      const seenAt = row.lastSeenAt ? new Date(row.lastSeenAt) : null;
      const activityAt = new Date(row.lastActivityAt);
      const unread = seenAt === null || seenAt.getTime() < activityAt.getTime();
      return {
        id: String(row.id),
        kind: row.kind as WorkspaceItemKind,
        targetId: String(row.targetId),
        pinned: row.pinned,
        unread,
        lastActivityAt: activityAt.toISOString(),
        title: info?.title ?? null,
        subtitle: info?.subtitle ?? null,
        url: info?.url ?? null,
      };
    });

    return { items };
  }

  async setPinned(
    userId: string,
    itemId: string,
    pinned: boolean,
  ): Promise<void> {
    await this.db
      .updateTable("workspace_items")
      .set({ pinned })
      .where("id", "=", itemId)
      .where("user_id", "=", userId)
      .execute();
  }

  async markSeen(userId: string, itemId: string): Promise<void> {
    await this.db
      .updateTable("workspace_items")
      .set({ last_seen_at: new Date() })
      .where("id", "=", itemId)
      .where("user_id", "=", userId)
      .execute();
  }

  async markTargetSeen(
    userId: string,
    kind: WorkspaceItemKind,
    targetId: string,
    seenAt = new Date(),
  ): Promise<void> {
    await this.db
      .updateTable("workspace_items")
      .set({ last_seen_at: seenAt })
      .where("user_id", "=", userId)
      .where("kind", "=", kind)
      .where("target_id", "=", targetId)
      .execute();
  }

  // Dropping a bookmark should not wipe an item the user explicitly pinned.
  async removeUnpinned(
    userId: string,
    kind: WorkspaceItemKind,
    targetId: string,
  ): Promise<void> {
    await this.db
      .deleteFrom("workspace_items")
      .where("user_id", "=", userId)
      .where("kind", "=", kind)
      .where("target_id", "=", targetId)
      .where("pinned", "=", false)
      .execute();
  }

  private async postDetails(ids: string[]): Promise<Map<string, DisplayInfo>> {
    const map = new Map<string, DisplayInfo>();
    if (ids.length === 0) return map;
    const rows = await this.db
      .selectFrom("posts as p")
      .innerJoin("profiles as author", "author.id", "p.author_id")
      .select([
        "p.id",
        "p.slug",
        "p.title",
        "p.plain_text as plainText",
        "author.username as authorUsername",
      ])
      .where("p.id", "in", ids)
      .where("p.deleted_at", "is", null)
      .execute();
    for (const row of rows) {
      const title = row.title ?? row.plainText.slice(0, 80) ?? null;
      map.set(String(row.id), {
        title: title || null,
        subtitle: `@${row.authorUsername}`,
        url: `/users/${row.authorUsername}/posts/${row.slug}`,
      });
    }
    return map;
  }

  private async conversationDetails(
    userId: string,
    ids: string[],
  ): Promise<Map<string, DisplayInfo>> {
    const map = new Map<string, DisplayInfo>();
    if (ids.length === 0) return map;

    const rows = await this.db
      .selectFrom("direct_conversations as c")
      .innerJoin("profiles as p1", "p1.id", "c.participant_one_id")
      .innerJoin("profiles as p2", "p2.id", "c.participant_two_id")
      .select([
        "c.id",
        "c.participant_one_id as p1Id",
        "c.participant_two_id as p2Id",
        "p1.display_name as p1Name",
        "p1.username as p1Username",
        "p2.display_name as p2Name",
        "p2.username as p2Username",
      ])
      .where("c.id", "in", ids)
      .execute();

    const lastMessages = await sql<{ conversation_id: string; body: string }>`
      select distinct on (conversation_id) conversation_id, body
      from direct_messages
      where conversation_id in (${sql.join(ids.map((id) => sql`${id}`))})
      order by conversation_id, created_at desc
    `.execute(this.db);
    const lastByConv = new Map(
      lastMessages.rows.map((m) => [String(m.conversation_id), m.body]),
    );

    for (const row of rows) {
      const isP1 = String(row.p1Id) === userId;
      const otherName = isP1 ? row.p2Name : row.p1Name;
      const otherUsername = isP1 ? row.p2Username : row.p1Username;
      map.set(String(row.id), {
        title: otherName ?? `@${otherUsername}`,
        subtitle: lastByConv.get(String(row.id)) ?? null,
        url: `/dashboard/messages?conversationId=${row.id}`,
      });
    }
    return map;
  }

  private async characterDetails(
    ids: string[],
  ): Promise<Map<string, DisplayInfo>> {
    const map = new Map<string, DisplayInfo>();
    if (ids.length === 0) return map;
    const rows = await this.db
      .selectFrom("characters as c")
      .leftJoin("pdf_templates as t", "t.id", "c.template_id")
      .select(["c.id", "c.name", "t.game_system as gameSystem"])
      .where("c.id", "in", ids)
      .where("c.deleted_at", "is", null)
      .execute();
    for (const row of rows) {
      map.set(String(row.id), {
        title: row.name,
        subtitle: row.gameSystem ?? null,
        url: `/characters/${row.id}`,
      });
    }
    return map;
  }

  private async systemDetails(
    ids: string[],
  ): Promise<Map<string, DisplayInfo>> {
    const map = new Map<string, DisplayInfo>();
    if (ids.length === 0) return map;
    const rows = await this.db
      .selectFrom("pdf_templates as t")
      .leftJoin("profiles as owner", "owner.id", "t.owner_id")
      .select([
        "t.id",
        "t.title",
        "t.slug",
        "t.game_system as gameSystem",
        "owner.username as ownerUsername",
      ])
      .where("t.id", "in", ids)
      .where("t.deleted_at", "is", null)
      .execute();
    for (const row of rows) {
      map.set(String(row.id), {
        title: row.title,
        subtitle: row.gameSystem ?? null,
        url: row.ownerUsername
          ? `/community/${row.ownerUsername}/${row.slug}`
          : null,
      });
    }
    return map;
  }
}
