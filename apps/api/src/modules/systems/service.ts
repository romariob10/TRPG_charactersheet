import type { Database } from "@mycharacter/database";
import type {
  CreateGameSystemRequest,
  CreateGameSystemResponse,
  GameSystemSummary,
  MaterialFileType,
  SheetKind,
  UnifiedGameSystemWorkspace,
  UpdateGameSystemRequest,
} from "@mycharacter/contracts";
import { defaultBoxProps, materialFileTypeSchema, sheetKindSchema } from "@mycharacter/contracts";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { randomUUID } from "node:crypto";
import { AppError } from "../../errors.js";

interface GameSystemRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  family: string | null;
  edition: string | null;
  visibility: "private" | "public";
  is_official: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  owner_id: string | null;
  legacy_template_id?: string | null;
  author_username?: string | null;
  author_display_name?: string | null;
  author_site_role?: string | null;
  author_is_admin?: boolean | null;
}

export class GameSystemsService {
  private readonly db: Kysely<Database>;

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  async list(
    userId?: string,
    scope: "all" | "mine" | "official" = "all",
  ): Promise<GameSystemSummary[]> {
    let query = this.db
      .selectFrom("game_systems as gs")
      .leftJoin("profiles as p", "p.id", "gs.owner_id")
      .where("gs.deleted_at", "is", null);

    if (scope === "official") {
      query = query
        .where("gs.visibility", "=", "public")
        .where("gs.is_official", "=", true);
    } else if (scope === "mine") {
      if (!userId) return [];
      query = query.where("gs.owner_id", "=", userId);
    } else if (userId) {
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
        "gs.is_official",
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

  async listForAdmin(): Promise<GameSystemSummary[]> {
    const rows = await this.db
      .selectFrom("game_systems as gs")
      .leftJoin("profiles as p", "p.id", "gs.owner_id")
      .where("gs.deleted_at", "is", null)
      .select([
        "gs.id",
        "gs.slug",
        "gs.title",
        "gs.description",
        "gs.family",
        "gs.edition",
        "gs.visibility",
        "gs.is_official",
        "gs.created_at",
        "gs.updated_at",
        "gs.owner_id",
        "p.username as author_username",
        "p.display_name as author_display_name",
        "p.site_role as author_site_role",
        "p.is_admin as author_is_admin",
      ])
      .orderBy("gs.is_official", "desc")
      .orderBy("gs.updated_at", "desc")
      .execute();

    return rows.map((row) => this.mapSummary(row));
  }

  async get(userId: string | null, idOrSlug: string): Promise<GameSystemSummary> {
    let row = await this.db
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
        "gs.is_official",
        "gs.created_at",
        "gs.updated_at",
        "gs.owner_id",
        "p.username as author_username",
        "p.display_name as author_display_name",
        "p.site_role as author_site_role",
        "p.is_admin as author_is_admin",
      ])
      .executeTakeFirst();

    // Fallback: check if idOrSlug matches legacy_template_id
    if (!row) {
      row = await this.db
        .selectFrom("game_systems as gs")
        .leftJoin("profiles as p", "p.id", "gs.owner_id")
        .where("gs.deleted_at", "is", null)
        .where("gs.legacy_template_id", "=", idOrSlug)
        .select([
          "gs.id",
          "gs.slug",
          "gs.title",
          "gs.description",
          "gs.family",
          "gs.edition",
          "gs.visibility",
          "gs.is_official",
          "gs.created_at",
          "gs.updated_at",
          "gs.owner_id",
          "p.username as author_username",
          "p.display_name as author_display_name",
          "p.site_role as author_site_role",
          "p.is_admin as author_is_admin",
        ])
        .executeTakeFirst();
    }

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
  ): Promise<CreateGameSystemResponse> {
    return await this.db.transaction().execute(async (trx) => {
      const slug = await this.generateUniqueSlug(input.title, trx);

      const inserted = await trx
        .insertInto("game_systems")
        .values({
          owner_id: userId,
          title: input.title,
          slug,
          description: input.description ?? "",
          family: input.family ?? null,
          edition: input.edition ?? null,
          visibility: input.visibility ?? "private",
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Create a default sheet definition for this system
      const defaultSheet = await trx
        .insertInto("sheet_definitions")
        .values({
          system_id: inserted.id,
          owner_id: userId,
          title: "Character Sheet",
          slug: "character",
          kind: "character",
          description: "Standard character sheet",
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Independent root node UUIDs for all 4 targets
      const createDefaultRoot = () => ({
        id: randomUUID(),
        kind: "frame",
        direction: "vertical",
        gap: 9,
        align: "stretch",
        justify: "start",
        wrap: false,
        collapseAdjacentStrokes: false,
        cornerOrnaments: {
          preset: "none",
          topLeft: true,
          topRight: true,
          bottomRight: true,
          bottomLeft: true,
        },
        box: defaultBoxProps,
        children: [],
      });

      const initialLayouts = {
        mobile: createDefaultRoot(),
        tablet: createDefaultRoot(),
        desktop: createDefaultRoot(),
        print: createDefaultRoot(),
      };

      await trx
        .insertInto("sheet_drafts")
        .values({
          sheet_definition_id: defaultSheet.id,
          schema_version: 1,
          revision: 1,
          layouts: JSON.stringify(initialLayouts),
          fields: JSON.stringify([]),
          updated_by: userId,
        })
        .execute();

      return {
        id: inserted.id,
        title: inserted.title,
        slug: inserted.slug,
        defaultSheetId: defaultSheet.id,
      };
    });
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
      .select(["id", "owner_id", "is_official"])
      .executeTakeFirst();

    if (!system) {
      throw new AppError("SYSTEM_NOT_FOUND", 404, "Game system not found.");
    }

    if (system.owner_id !== userId) {
      throw new AppError("FORBIDDEN", 403, "Only the owner can modify this game system.");
    }

    if (system.is_official && input.visibility === "private") {
      throw new AppError(
        "OFFICIAL_SYSTEM_MUST_BE_PUBLIC",
        409,
        "An official game system must remain public.",
      );
    }

    await this.db
      .updateTable("game_systems")
      .set({
        title: input.title,
        description: input.description,
        family: input.family,
        edition: input.edition,
        visibility: input.visibility,
        updated_at: sql`now()`,
      })
      .where("id", "=", systemId)
      .execute();

    return this.get(userId, systemId);
  }

  async setOfficial(
    systemId: string,
    isOfficial: boolean,
  ): Promise<GameSystemSummary> {
    const system = await this.db
      .selectFrom("game_systems")
      .where("id", "=", systemId)
      .where("deleted_at", "is", null)
      .select("id")
      .executeTakeFirst();

    if (!system) {
      throw new AppError("SYSTEM_NOT_FOUND", 404, "Game system not found.");
    }

    await this.db
      .updateTable("game_systems")
      .set({
        is_official: isOfficial,
        ...(isOfficial ? { visibility: "public" as const } : {}),
        updated_at: sql`now()`,
      })
      .where("id", "=", systemId)
      .execute();

    const updated = await this.db
      .selectFrom("game_systems as gs")
      .leftJoin("profiles as p", "p.id", "gs.owner_id")
      .where("gs.id", "=", systemId)
      .select([
        "gs.id",
        "gs.slug",
        "gs.title",
        "gs.description",
        "gs.family",
        "gs.edition",
        "gs.visibility",
        "gs.is_official",
        "gs.created_at",
        "gs.updated_at",
        "gs.owner_id",
        "p.username as author_username",
        "p.display_name as author_display_name",
        "p.site_role as author_site_role",
        "p.is_admin as author_is_admin",
      ])
      .executeTakeFirstOrThrow();

    return this.mapSummary(updated);
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
    idOrSlug: string,
  ): Promise<UnifiedGameSystemWorkspace> {
    const system = await this.get(userId, idOrSlug);

    // Sheets
    const sheets = await this.db
      .selectFrom("sheet_definitions as sd")
      .leftJoin("sheet_versions as sv", "sv.id", "sd.current_version_id")
      .where("sd.system_id", "=", system.id)
      .where("sd.deleted_at", "is", null)
      .select([
        "sd.id",
        "sd.title",
        "sd.slug",
        "sd.kind",
        "sd.description",
        "sd.current_version_id",
        "sv.version_number as current_version_number",
        "sd.created_at",
        "sd.updated_at",
      ])
      .orderBy("sd.updated_at", "desc")
      .execute();

    // Materials - canonical query by system_id
    const materials = await this.db
      .selectFrom("system_materials")
      .where("system_id", "=", system.id)
      .selectAll()
      .orderBy("created_at", "desc")
      .execute();

    // Characters
    const characters = await this.db
      .selectFrom("characters as c")
      .leftJoin("profiles as p", "p.id", "c.owner_id")
      .where("c.system_id", "=", system.id)
      .where("c.status", "=", "active")
      .where("c.deleted_at", "is", null)
      .select([
        "c.id",
        "c.name",
        "c.slug",
        "c.is_public",
        "c.published_at",
        "c.revision",
        "c.updated_at",
        "c.owner_id",
        "p.username as author_username",
        "p.display_name as author_display_name",
        "p.site_role as author_site_role",
        "p.is_admin as author_is_admin",
      ])
      .orderBy("c.updated_at", "desc")
      .limit(50)
      .execute();

    // Posts - canonical query by game_system_id with fallback to system_id
    const posts = await this.db
      .selectFrom("posts as p")
      .leftJoin("profiles as prof", "prof.id", "p.author_id")
      .where((eb) =>
        eb.or([
          eb("p.game_system_id", "=", system.id),
          eb("p.system_id", "=", system.id),
        ]),
      )
      .where("p.deleted_at", "is", null)
      .where("p.is_hidden", "=", false)
      .select([
        "p.id",
        "p.title",
        "p.plain_text as excerpt",
        "p.slug",
        "p.created_at",
        "prof.username as authorUsername",
      ])
      .orderBy("p.created_at", "desc")
      .limit(30)
      .execute();

    return {
      system,
      sheets: sheets.map((s) => {
        const parsedKind = sheetKindSchema.safeParse(s.kind);
        const kind: SheetKind = parsedKind.success ? parsedKind.data : "character";
        return {
          id: s.id,
          systemId: system.id,
          title: s.title,
          slug: s.slug,
          kind,
          description: s.description ?? "",
          currentVersionId: s.current_version_id ?? null,
          currentVersionNumber: s.current_version_number ?? null,
          createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at),
          updatedAt: s.updated_at instanceof Date ? s.updated_at.toISOString() : String(s.updated_at),
        };
      }),
      materials: materials.map((m) => {
        const parsedType = materialFileTypeSchema.safeParse(m.file_type);
        const fileType: MaterialFileType = parsedType.success ? parsedType.data : "pdf";
        return {
          id: m.id,
          templateId: m.template_id ?? m.system_id ?? system.id,
          title: m.title,
          fileType,
          sizeBytes: m.size_bytes,
          url: `/api/systems/${m.template_id ?? m.system_id ?? system.id}/materials/${m.id}/download`,
          createdAt: m.created_at instanceof Date ? m.created_at.toISOString() : String(m.created_at),
        };
      }),
      characters: characters.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        isPublic: Boolean(c.is_public),
        publishedAt: c.published_at instanceof Date ? c.published_at.toISOString() : null,
        author: c.owner_id && c.author_username ? {
          id: c.owner_id,
          username: c.author_username,
          displayName: c.author_display_name ?? null,
        } : undefined,
        gameSystem: system.title,
        role: c.owner_id === userId ? ("owner" as const) : ("editor" as const),
        revision: Number(c.revision) || 0,
        status: "active" as const,
        catalogStatus: "ready" as const,
        pageCount: 1,
        updatedAt: c.updated_at instanceof Date ? c.updated_at.toISOString() : String(c.updated_at),
        deletedAt: null,
      })),
      posts: posts.map((p) => ({
        id: p.id,
        title: p.title ?? "Untitled",
        excerpt: p.excerpt.slice(0, 200),
        authorUsername: p.authorUsername ?? "anonymous",
        slug: p.slug,
        createdAt: p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
      })),
      isOwner: Boolean(system.isOwner),
    };
  }

  private mapSummary(row: GameSystemRow, currentUserId?: string): GameSystemSummary {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description ?? "",
      family: row.family,
      edition: row.edition,
      visibility: row.visibility,
      isOfficial: row.is_official,
      legacyTemplateId: row.legacy_template_id ?? undefined,
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

  private async generateUniqueSlug(title: string, db: Kysely<Database> = this.db): Promise<string> {
    const baseSlug = title
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "system";

    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await db
        .selectFrom("game_systems")
        .where("slug", "=", slug)
        .select("id")
        .executeTakeFirst();
      if (!existing) return slug;
      slug = `${baseSlug}-${counter++}`;
    }
  }
}
