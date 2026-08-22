import type { Database } from "@mycharacter/database";
import type {
  CreateGameSystemRequest,
  GameSystemSummary,
  UnifiedGameSystemWorkspace,
  UpdateGameSystemRequest,
} from "@mycharacter/contracts";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { AppError } from "../../errors.js";

export class GameSystemsService {
  private readonly db: Kysely<Database>;

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  async list(userId?: string): Promise<GameSystemSummary[]> {
    let query = this.db
      .selectFrom("game_systems as gs")
      .leftJoin("profiles as p", "p.id", "gs.owner_id")
      .where("gs.deleted_at", "is", null);

    if (userId) {
      query = query.where((eb) =>
        eb.or([eb("gs.visibility", "=", "public"), eb("gs.owner_id", "=", userId)]),
      );
    } else {
      query = query.where("gs.visibility", "=", "public");
    }

    const rows = await query
      .select([
        "gs.id",
        "gs.slug",
        "gs.title",
        "gs.description",
        "gs.family",
        "gs.edition",
        "gs.visibility",
        "gs.created_at",
        "gs.updated_at",
        "gs.owner_id",
        "p.username as author_username",
        "p.display_name as author_display_name",
        "p.site_role as author_site_role",
        "p.is_admin as author_is_admin",
      ])
      .orderBy("gs.updated_at", "desc")
      .execute();

    return rows.map((r) => this.mapSummary(r, userId));
  }

  async get(userId: string | null, idOrSlug: string): Promise<GameSystemSummary> {
    const row = await this.db
      .selectFrom("game_systems as gs")
      .leftJoin("profiles as p", "p.id", "gs.owner_id")
      .where("gs.deleted_at", "is", null)
      .where((eb) => eb.or([eb("gs.id", "=", idOrSlug), eb("gs.slug", "=", idOrSlug)]))
      .select([
        "gs.id",
        "gs.slug",
        "gs.title",
        "gs.description",
        "gs.family",
        "gs.edition",
        "gs.visibility",
        "gs.created_at",
        "gs.updated_at",
        "gs.owner_id",
        "p.username as author_username",
        "p.display_name as author_display_name",
        "p.site_role as author_site_role",
        "p.is_admin as author_is_admin",
      ])
      .executeTakeFirst();

    if (!row) {
      throw new AppError("SYSTEM_NOT_FOUND", 404, "Game system not found.");
    }

    if (row.visibility !== "public" && row.owner_id !== userId) {
      throw new AppError("FORBIDDEN", 403, "Access to this game system is restricted.");
    }

    return this.mapSummary(row, userId ?? undefined);
  }

  async create(
    userId: string,
    input: CreateGameSystemRequest,
  ): Promise<GameSystemSummary> {
    const slug = await this.generateUniqueSlug(input.title);

    const inserted = await this.db
      .insertInto("game_systems")
      .values({
        owner_id: userId,
        title: input.title,
        slug,
        description: input.description,
        family: input.family ?? null,
        edition: input.edition ?? null,
        visibility: input.visibility,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Create a default sheet definition for this system
    await this.db
      .insertInto("sheet_definitions")
      .values({
        system_id: inserted.id,
        owner_id: userId,
        title: "Character Sheet",
        slug: "character",
        kind: "character",
        description: "Standard character sheet",
      })
      .execute();

    return this.get(userId, inserted.id);
  }

  async update(
    userId: string,
    systemId: string,
    input: UpdateGameSystemRequest,
  ): Promise<GameSystemSummary> {
    const system = await this.db
      .selectFrom("game_systems")
      .where("id", "=", systemId)
      .where("deleted_at", "is", null)
      .select(["id", "owner_id"])
      .executeTakeFirst();

    if (!system) {
      throw new AppError("SYSTEM_NOT_FOUND", 404, "Game system not found.");
    }

    if (system.owner_id !== userId) {
      throw new AppError("FORBIDDEN", 403, "Only the owner can edit this game system.");
    }

    await this.db
      .updateTable("game_systems")
      .set({
        ...(input.title ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.family !== undefined ? { family: input.family } : {}),
        ...(input.edition !== undefined ? { edition: input.edition } : {}),
        ...(input.visibility ? { visibility: input.visibility } : {}),
        updated_at: sql`now()`,
      })
      .where("id", "=", systemId)
      .execute();

    return this.get(userId, systemId);
  }

  async delete(userId: string, systemId: string): Promise<void> {
    const system = await this.db
      .selectFrom("game_systems")
      .where("id", "=", systemId)
      .where("deleted_at", "is", null)
      .select(["id", "owner_id"])
      .executeTakeFirst();

    if (!system) {
      throw new AppError("SYSTEM_NOT_FOUND", 404, "Game system not found.");
    }

    if (system.owner_id !== userId) {
      throw new AppError("FORBIDDEN", 403, "Only the owner can delete this game system.");
    }

    await this.db
      .updateTable("game_systems")
      .set({ deleted_at: sql`now()` })
      .where("id", "=", systemId)
      .execute();
  }

  async getWorkspace(
    userId: string,
    systemIdOrSlug: string,
  ): Promise<UnifiedGameSystemWorkspace> {
    const system = await this.get(userId, systemIdOrSlug);

    const sheets = await this.db
      .selectFrom("sheet_definitions as sd")
      .leftJoin("sheet_versions as sv", "sv.id", "sd.current_version_id")
      .where("sd.system_id", "=", system.id)
      .where("sd.deleted_at", "is", null)
      .select([
        "sd.id",
        "sd.system_id as systemId",
        "sd.title",
        "sd.description",
        "sd.slug",
        "sd.kind",
        "sd.updated_at as updatedAt",
        "sv.version_number as currentVersionNumber",
      ])
      .orderBy("sd.created_at", "asc")
      .execute();

    const characters = await this.db
      .selectFrom("characters as c")
      .where((eb) =>
        eb.or([
          eb("c.system_id", "=", system.id),
          eb("c.template_id", "=", system.id),
        ]),
      )
      .where("c.owner_id", "=", userId)
      .where("c.status", "=", "active")
      .where("c.deleted_at", "is", null)
      .select(["c.id", "c.name", "c.slug", "c.is_public as isPublic"])
      .orderBy("c.updated_at", "desc")
      .execute();

    const materials = await this.db
      .selectFrom("system_materials as sm")
      .where((eb) =>
        eb.or([
          eb("sm.system_id", "=", system.id),
          eb("sm.template_id", "=", system.id),
        ]),
      )
      .select([
        "sm.id",
        "sm.template_id as templateId",
        "sm.title",
        "sm.file_type as fileType",
        "sm.size_bytes as sizeBytes",
        "sm.created_at as createdAt",
      ])
      .orderBy("sm.created_at", "desc")
      .execute();

    const posts = await this.db
      .selectFrom("posts as p")
      .leftJoin("profiles as pr", "pr.id", "p.author_id")
      .where("p.system_id", "=", system.id)
      .where("p.deleted_at", "is", null)
      .select([
        "p.id",
        "p.title",
        "p.plain_text as excerpt",
        "pr.username as authorUsername",
        "p.slug",
        "p.created_at as createdAt",
      ])
      .orderBy("p.created_at", "desc")
      .limit(20)
      .execute();

    return {
      system,
      sheets: sheets.map((s) => ({
        ...s,
        updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : String(s.updatedAt),
      })),
      characters: characters.map((c) => ({
        ...c,
        isPublic: Boolean(c.isPublic),
      })),
      materials: materials.map((m) => ({
        ...m,
        fileType: m.fileType === "pdf" ? "pdf" : "image",
        url: `/api/systems/${system.id}/materials/${m.id}/download`,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
      })),
      posts: posts.map((p) => ({
        id: p.id,
        title: p.title,
        excerpt: p.excerpt.slice(0, 200),
        authorUsername: p.authorUsername ?? "anonymous",
        slug: p.slug,
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      })),
      isOwner: Boolean(system.isOwner),
    };
  }

  private mapSummary(row: any, currentUserId?: string): GameSystemSummary {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description ?? "",
      family: row.family,
      edition: row.edition,
      visibility: row.visibility,
      isOwner: Boolean(currentUserId && row.owner_id === currentUserId),
      owner: row.owner_id && row.author_username
        ? {
            id: row.owner_id,
            username: row.author_username,
            displayName: row.author_display_name ?? null,
          }
        : undefined,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      sheetCount: 0,
      characterCount: 0,
      materialCount: 0,
      postCount: 0,
    };
  }

  private async generateUniqueSlug(title: string): Promise<string> {
    const baseSlug = title
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "system";

    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await this.db
        .selectFrom("game_systems")
        .where("slug", "=", slug)
        .select("id")
        .executeTakeFirst();
      if (!existing) return slug;
      slug = `${baseSlug}-${counter++}`;
    }
  }
}
