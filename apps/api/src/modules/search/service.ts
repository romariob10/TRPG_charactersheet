import type {
  SearchItem,
  SearchQuery,
  SearchResponse,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import { sql, type Kysely } from "kysely";

export class SearchService {
  private readonly db: Kysely<Database>;

  constructor(database: Kysely<Database>) {
    this.db = database;
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const q = query.q.trim();
    const pattern = `%${q.toLowerCase()}%`;
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const type = query.type ?? "all";
    const promises: Promise<SearchItem[]>[] = [];

    if (type === "all" || type === "post") {
      promises.push(this.searchPosts(pattern, limit));
    }
    if (type === "all" || type === "character") {
      promises.push(this.searchCharacters(pattern, limit));
    }
    if (type === "all" || type === "template") {
      promises.push(this.searchTemplates(pattern, limit));
    }
    if (type === "all" || type === "user") {
      promises.push(this.searchUsers(pattern, limit));
    }

    const itemArrays = await Promise.all(promises);
    const flattened = itemArrays.flat();

    // Sort by relevance (exact match on title/username first, then date)
    flattened.sort((a, b) => {
      const aExact = a.title.toLowerCase().startsWith(q.toLowerCase());
      const bExact = b.title.toLowerCase().startsWith(q.toLowerCase());
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return 0;
    });

    const results = flattened.slice(0, limit);

    return {
      query: q,
      total: results.length,
      results,
    };
  }

  private async searchPosts(
    pattern: string,
    limit: number,
  ): Promise<SearchItem[]> {
    const rows = await this.db
      .selectFrom("posts as p")
      .innerJoin("profiles as a", "a.id", "p.author_id")
      .innerJoin("users as u", "u.id", "p.author_id")
      .select([
        "p.id",
        "p.slug",
        "p.title",
        "p.plain_text as plainText",
        "p.published_at as publishedAt",
        "a.id as authorId",
        "a.username as authorUsername",
        "a.display_name as authorDisplayName",
      ])
      .where("u.status", "=", "active")
      .where("p.deleted_at", "is", null)
      .where("p.is_hidden", "=", false)
      .where((eb) =>
        eb.or([
          eb(sql`lower(p.title)`, "like", pattern),
          eb(sql`lower(p.plain_text)`, "like", pattern),
          eb(sql`lower(a.username)`, "like", pattern),
        ]),
      )
      .orderBy("p.published_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((r) => ({
      id: String(r.id),
      type: "post",
      title: r.title || r.plainText.slice(0, 60),
      subtitle: r.plainText.slice(0, 120),
      url: `/users/${r.authorUsername}/posts/${r.slug}`,
      author: {
        id: String(r.authorId),
        username: r.authorUsername,
        displayName: r.authorDisplayName,
      },
      createdAt: r.publishedAt.toISOString(),
    }));
  }

  private async searchCharacters(
    pattern: string,
    limit: number,
  ): Promise<SearchItem[]> {
    const rows = await this.db
      .selectFrom("characters as c")
      .innerJoin("profiles as a", "a.id", "c.owner_id")
      .innerJoin("users as u", "u.id", "c.owner_id")
      .leftJoin("pdf_templates as t", "t.id", "c.template_id")
      .select([
        "c.id",
        "c.name",
        "c.slug",
        "c.updated_at as updatedAt",
        "t.game_system as gameSystem",
        "a.id as authorId",
        "a.username as authorUsername",
        "a.display_name as authorDisplayName",
      ])
      .where("u.status", "=", "active")
      .where("c.status", "=", "active")
      .where("c.is_public", "=", true)
      .where((eb) =>
        eb.or([
          eb(sql`lower(c.name)`, "like", pattern),
          eb(sql`lower(t.game_system)`, "like", pattern),
          eb(sql`lower(a.username)`, "like", pattern),
        ]),
      )
      .orderBy("c.updated_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((r) => ({
      id: String(r.id),
      type: "character",
      title: r.name,
      subtitle: r.gameSystem ?? "Character sheet",
      url: `/users/${r.authorUsername}/characters/${r.slug}`,
      author: {
        id: String(r.authorId),
        username: r.authorUsername,
        displayName: r.authorDisplayName,
      },
      createdAt: r.updatedAt.toISOString(),
    }));
  }

  private async searchTemplates(
    pattern: string,
    limit: number,
  ): Promise<SearchItem[]> {
    const rows = await this.db
      .selectFrom("pdf_templates as t")
      .innerJoin("profiles as a", "a.id", "t.owner_id")
      .innerJoin("users as u", "u.id", "t.owner_id")
      .select([
        "t.id",
        "t.title",
        "t.slug",
        "t.game_system as gameSystem",
        "t.page_count as pageCount",
        "t.updated_at as updatedAt",
        "a.id as authorId",
        "a.username as authorUsername",
        "a.display_name as authorDisplayName",
      ])
      .where("u.status", "=", "active")
      .where("t.deleted_at", "is", null)
      .where("t.is_public", "=", true)
      .where((eb) =>
        eb.or([
          eb(sql`lower(t.title)`, "like", pattern),
          eb(sql`lower(t.game_system)`, "like", pattern),
          eb(sql`lower(a.username)`, "like", pattern),
        ]),
      )
      .orderBy("t.updated_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((r) => ({
      id: String(r.id),
      type: "template",
      title: r.title,
      subtitle: r.gameSystem ?? "RPG System Sheet",
      url: `/users/${r.authorUsername}/systems/${r.slug}`,
      author: {
        id: String(r.authorId),
        username: r.authorUsername,
        displayName: r.authorDisplayName,
      },
      createdAt: r.updatedAt.toISOString(),
    }));
  }

  private async searchUsers(
    pattern: string,
    limit: number,
  ): Promise<SearchItem[]> {
    const rows = await this.db
      .selectFrom("profiles as p")
      .innerJoin("users as u", "u.id", "p.id")
      .select([
        "p.id",
        "p.username",
        "p.display_name as displayName",
        "p.bio",
        "u.created_at as joinedAt",
      ])
      .where("u.status", "=", "active")
      .where((eb) =>
        eb.or([
          eb(sql`lower(p.username)`, "like", pattern),
          eb(sql`lower(p.display_name)`, "like", pattern),
          eb(sql`lower(p.bio)`, "like", pattern),
        ]),
      )
      .orderBy("u.created_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((r) => ({
      id: String(r.id),
      type: "user",
      title: r.displayName ?? `@${r.username}`,
      subtitle: r.bio ? r.bio.slice(0, 100) : `@${r.username}`,
      url: `/users/${r.username}`,
      author: {
        id: String(r.id),
        username: r.username,
        displayName: r.displayName,
      },
      createdAt: r.joinedAt.toISOString(),
    }));
  }
}
