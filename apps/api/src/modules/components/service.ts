import type { Database } from "@mycharacter/database";
import type {
  AutosaveComponentDraftRequest,
  AutosaveComponentDraftResponse,
  ComponentSummary,
  ComponentVersionDetails,
  CreateComponentRequest,
  ForkComponentRequest,
  ListComponentsQuery,
  ListComponentsResponse,
  PublishComponentVersionRequest,
  PublishComponentVersionResponse,
} from "@mycharacter/contracts";
import {
  defaultBoxProps,
  targetLayoutMapSchema,
  validateLayoutNodeConstraints,
  type LayoutNode,
} from "@mycharacter/contracts";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { AppError } from "../../errors.js";

export class ComponentLibraryService {
  private readonly db: Kysely<Database>;

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  async listComponents(
    userId: string | null,
    query: ListComponentsQuery,
  ): Promise<ListComponentsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    let baseQuery = this.db
      .selectFrom("component_definitions as cd")
      .leftJoin("profiles as p", "p.id", "cd.author_id")
      .leftJoin("game_systems as gs", "gs.id", "cd.system_id")
      .leftJoin("component_versions as cv", "cv.id", "cd.current_version_id")
      .where("cd.deleted_at", "is", null);

    if (query.scope === "personal") {
      if (!userId) {
        throw new AppError("UNAUTHORIZED", 401, "Authentication required.");
      }
      baseQuery = baseQuery.where("cd.author_id", "=", userId);
    } else if (query.scope === "system" && query.systemId) {
      baseQuery = baseQuery.where("cd.system_id", "=", query.systemId);
    } else if (query.scope === "curated") {
      baseQuery = baseQuery.where("cd.scope", "=", "curated");
    } else {
      // Public / Community
      baseQuery = baseQuery.where((eb) =>
        eb.or([
          eb("cd.scope", "in", ["public", "curated"]),
          ...(userId ? [eb("cd.author_id", "=", userId)] : []),
        ]),
      );
    }

    if (query.search) {
      const pattern = `%${query.search.toLowerCase()}%`;
      baseQuery = baseQuery.where((eb) =>
        eb.or([
          eb(sql`lower(cd.name)`, "like", pattern),
          eb(sql`lower(cd.description)`, "like", pattern),
        ]),
      );
    }

    if (query.tag) {
      baseQuery = baseQuery.where((eb) =>
        eb(sql`${query.tag}`, "=", sql`ANY(cd.tags)`),
      );
    }

    const totalRow = await baseQuery
      .select(sql<number>`count(*)`.as("count"))
      .executeTakeFirst();

    const total = Number(totalRow?.count ?? 0);

    const rows = await baseQuery
      .select([
        "cd.id",
        "cd.slug",
        "cd.name",
        "cd.description",
        "cd.scope",
        "cd.system_id as systemId",
        "cd.tags",
        "cd.thumbnail_url as thumbnailUrl",
        "cd.current_version_id as currentVersionId",
        "cd.usage_count as usageCount",
        "cd.created_at as createdAt",
        "cd.updated_at as updatedAt",
        "cd.author_id as authorId",
        "p.username as authorUsername",
        "p.display_name as authorDisplayName",
        "p.site_role as authorSiteRole",
        "p.is_admin as authorIsAdmin",
        "gs.title as systemTitle",
        "cv.version_number as currentVersionNumber",
      ])
      .orderBy("cd.updated_at", "desc")
      .offset(offset)
      .limit(limit)
      .execute();

    const components: ComponentSummary[] = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      scope: r.scope as ComponentSummary["scope"],
      systemId: r.systemId,
      systemTitle: r.systemTitle,
      tags: r.tags ?? [],
      thumbnailUrl: r.thumbnailUrl,
      currentVersionId: r.currentVersionId,
      currentVersionNumber: r.currentVersionNumber,
      usageCount: r.usageCount,
      isOwner: Boolean(userId && r.authorId === userId),
      author: r.authorId && r.authorUsername
        ? {
            id: r.authorId,
            username: r.authorUsername,
            displayName: r.authorDisplayName ?? null,
          }
        : undefined,
      createdAt:
        r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      updatedAt:
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    }));

    return {
      components,
      total,
      page,
      limit,
      hasMore: offset + components.length < total,
    };
  }

  async getComponent(
    userId: string | null,
    componentId: string,
  ): Promise<ComponentSummary> {
    const row = await this.db
      .selectFrom("component_definitions as cd")
      .leftJoin("profiles as p", "p.id", "cd.author_id")
      .leftJoin("game_systems as gs", "gs.id", "cd.system_id")
      .leftJoin("component_versions as cv", "cv.id", "cd.current_version_id")
      .where("cd.id", "=", componentId)
      .where("cd.deleted_at", "is", null)
      .select([
        "cd.id",
        "cd.slug",
        "cd.name",
        "cd.description",
        "cd.scope",
        "cd.system_id as systemId",
        "cd.tags",
        "cd.thumbnail_url as thumbnailUrl",
        "cd.current_version_id as currentVersionId",
        "cd.usage_count as usageCount",
        "cd.created_at as createdAt",
        "cd.updated_at as updatedAt",
        "cd.author_id as authorId",
        "p.username as authorUsername",
        "p.display_name as authorDisplayName",
        "p.site_role as authorSiteRole",
        "p.is_admin as authorIsAdmin",
        "gs.title as systemTitle",
        "cv.version_number as currentVersionNumber",
      ])
      .executeTakeFirst();

    if (!row) {
      throw new AppError("COMPONENT_NOT_FOUND", 404, "Component not found.");
    }

    if (
      row.scope === "personal" &&
      (!userId || row.authorId !== userId)
    ) {
      throw new AppError("FORBIDDEN", 403, "Access restricted.");
    }

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      scope: row.scope as ComponentSummary["scope"],
      systemId: row.systemId,
      systemTitle: row.systemTitle,
      tags: row.tags ?? [],
      thumbnailUrl: row.thumbnailUrl,
      currentVersionId: row.currentVersionId,
      currentVersionNumber: row.currentVersionNumber,
      usageCount: row.usageCount,
      isOwner: Boolean(userId && row.authorId === userId),
      author: row.authorId && row.authorUsername
        ? {
            id: row.authorId,
            username: row.authorUsername,
            displayName: row.authorDisplayName ?? null,
          }
        : undefined,
      createdAt:
        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updatedAt:
        row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }

  async createComponent(
    userId: string,
    input: CreateComponentRequest,
  ): Promise<ComponentSummary> {
    const slug = await this.generateUniqueSlug(input.name);

    const defaultRoot = input.layouts?.desktop ?? {
      id: crypto.randomUUID(),
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
    };

    const initialLayouts = input.layouts ?? {
      mobile: defaultRoot,
      tablet: defaultRoot,
      desktop: defaultRoot,
      print: defaultRoot,
    };

    const inserted = await this.db
      .insertInto("component_definitions")
      .values({
        author_id: userId,
        slug,
        name: input.name,
        description: input.description ?? "",
        scope: input.scope ?? "personal",
        system_id: input.systemId ?? null,
        tags: input.tags ?? [],
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await this.db
      .insertInto("component_drafts")
      .values({
        component_id: inserted.id,
        schema_version: 1,
        revision: 1,
        layouts: JSON.stringify(initialLayouts),
        exposed_properties: JSON.stringify(input.exposedProperties ?? []),
        dependencies: JSON.stringify([]),
        updated_by: userId,
      })
      .execute();

    return this.getComponent(userId, inserted.id);
  }

  async autosaveComponentDraft(
    userId: string,
    componentId: string,
    input: AutosaveComponentDraftRequest,
  ): Promise<AutosaveComponentDraftResponse> {
    const comp = await this.db
      .selectFrom("component_definitions")
      .where("id", "=", componentId)
      .where("deleted_at", "is", null)
      .select(["id", "author_id as authorId"])
      .executeTakeFirst();

    if (!comp) {
      throw new AppError("COMPONENT_NOT_FOUND", 404, "Component not found.");
    }

    if (comp.authorId !== userId) {
      throw new AppError("FORBIDDEN", 403, "Only the author can edit component drafts.");
    }

    const currentDraft = await this.db
      .selectFrom("component_drafts")
      .where("component_id", "=", componentId)
      .select(["id", "revision"])
      .executeTakeFirst();

    if (!currentDraft) {
      throw new AppError("DRAFT_NOT_FOUND", 404, "Component draft not found.");
    }

    if (currentDraft.revision !== input.expectedRevision) {
      throw new AppError(
        "REVISION_CONFLICT",
        409,
        "Draft was modified in another session. Please reload the latest version.",
      );
    }

    const normalizedLayouts = targetLayoutMapSchema.parse(input.layouts);
    const validationErrors: string[] = [];
    const entries = Object.entries(normalizedLayouts) as [string, LayoutNode][];
    for (const [targetName, rootNode] of entries) {
      const check = validateLayoutNodeConstraints(rootNode);
      if (!check.valid) {
        validationErrors.push(
          ...check.errors.map((e) => `[${targetName}] ${e}`),
        );
      }
    }

    const nextRevision = currentDraft.revision + 1;
    const now = new Date();

    await this.db
      .updateTable("component_drafts")
      .set({
        revision: nextRevision,
        layouts: JSON.stringify(normalizedLayouts),
        exposed_properties: JSON.stringify(input.exposedProperties ?? []),
        dependencies: JSON.stringify(input.dependencies ?? []),
        updated_by: userId,
        updated_at: now,
      })
      .where("id", "=", currentDraft.id)
      .execute();

    await this.db
      .updateTable("component_definitions")
      .set({ updated_at: now })
      .where("id", "=", componentId)
      .execute();

    return {
      revision: nextRevision,
      updatedAt: now.toISOString(),
      valid: validationErrors.length === 0,
      validationErrors,
    };
  }

  async publishComponentVersion(
    userId: string,
    componentId: string,
    input: PublishComponentVersionRequest,
  ): Promise<PublishComponentVersionResponse> {
    const comp = await this.db
      .selectFrom("component_definitions")
      .where("id", "=", componentId)
      .where("deleted_at", "is", null)
      .select(["id", "author_id as authorId", "scope"])
      .executeTakeFirst();

    if (!comp) {
      throw new AppError("COMPONENT_NOT_FOUND", 404, "Component not found.");
    }

    if (comp.authorId !== userId) {
      throw new AppError("FORBIDDEN", 403, "Only the author can publish component versions.");
    }

    const draft = await this.db
      .selectFrom("component_drafts")
      .where("component_id", "=", componentId)
      .selectAll()
      .executeTakeFirst();

    if (!draft) {
      throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found.");
    }

    const layouts =
      typeof draft.layouts === "string" ? JSON.parse(draft.layouts) : draft.layouts;

    const parsedLayouts = targetLayoutMapSchema.safeParse(layouts);
    if (!parsedLayouts.success) {
      throw new AppError(
        "INVALID_LAYOUT_BLUEPRINT",
        400,
        "All four target layouts (mobile, tablet, desktop, print) must be valid before publication.",
      );
    }

    for (const [targetName, rootNode] of Object.entries(parsedLayouts.data)) {
      const check = validateLayoutNodeConstraints(rootNode);
      if (!check.valid) {
        throw new AppError(
          "LAYOUT_VALIDATION_FAILED",
          400,
          `Target layout [${targetName}] failed validation: ${check.errors.join("; ")}`,
        );
      }
    }

    const dependencies: string[] =
      typeof draft.dependencies === "string"
        ? JSON.parse(draft.dependencies)
        : (draft.dependencies ?? []);

    // Check for direct self-reference or cycles
    if (dependencies.includes(componentId)) {
      throw new AppError("CIRCULAR_DEPENDENCY", 400, "Component cannot depend on itself.");
    }

    const latestVersion = await this.db
      .selectFrom("component_versions")
      .where("component_id", "=", componentId)
      .select(sql<number>`COALESCE(MAX(version_number), 0)`.as("maxVer"))
      .executeTakeFirst();

    const nextVersionNumber = Number(latestVersion?.maxVer ?? 0) + 1;

    return this.db.transaction().execute(async (trx) => {
      const published = await trx
        .insertInto("component_versions")
        .values({
          component_id: componentId,
          version_number: nextVersionNumber,
          schema_version: draft.schema_version,
          layouts: JSON.stringify(parsedLayouts.data),
          exposed_properties: draft.exposed_properties,
          dependencies: JSON.stringify(dependencies),
          changelog: input.changelog,
          author_id: userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Record dependencies
      for (const depId of dependencies) {
        await trx
          .insertInto("component_dependencies")
          .values({
            parent_version_id: published.id,
            child_version_id: depId,
          })
          .onConflict((oc) => oc.doNothing())
          .execute();
      }

      await trx
        .updateTable("component_definitions")
        .set({
          current_version_id: published.id,
          updated_at: sql`now()`,
        })
        .where("id", "=", componentId)
        .execute();

      return {
        versionId: published.id,
        versionNumber: published.version_number,
        publishedAt:
          published.created_at instanceof Date
            ? published.created_at.toISOString()
            : String(published.created_at),
      };
    });
  }

  async forkComponent(
    userId: string,
    componentId: string,
    input: ForkComponentRequest,
  ): Promise<ComponentSummary> {
    const original = await this.getComponent(userId, componentId);

    const draft = await this.db
      .selectFrom("component_drafts")
      .where("component_id", "=", componentId)
      .selectAll()
      .executeTakeFirst();

    const layouts = draft
      ? typeof draft.layouts === "string"
        ? JSON.parse(draft.layouts)
        : draft.layouts
      : undefined;

    const exposedProperties = draft
      ? typeof draft.exposed_properties === "string"
        ? JSON.parse(draft.exposed_properties)
        : draft.exposed_properties
      : [];

    return this.createComponent(userId, {
      name: input.name ?? `${original.name} (Fork)`,
      description: original.description,
      scope: input.scope ?? "personal",
      systemId: input.systemId ?? original.systemId,
      tags: original.tags,
      layouts,
      exposedProperties,
    });
  }

  async getComponentVersion(versionId: string): Promise<ComponentVersionDetails> {
    const version = await this.db
      .selectFrom("component_versions")
      .where("id", "=", versionId)
      .selectAll()
      .executeTakeFirst();

    if (!version) {
      throw new AppError("VERSION_NOT_FOUND", 404, "Component version not found.");
    }

    const storedLayouts =
      typeof version.layouts === "string"
        ? JSON.parse(version.layouts)
        : version.layouts;
    const layouts = targetLayoutMapSchema.parse(storedLayouts);

    const exposedProperties =
      typeof version.exposed_properties === "string"
        ? JSON.parse(version.exposed_properties)
        : version.exposed_properties;

    const dependencies =
      typeof version.dependencies === "string"
        ? JSON.parse(version.dependencies)
        : version.dependencies;

    return {
      id: version.id,
      componentId: version.component_id,
      versionNumber: version.version_number,
      schemaVersion: version.schema_version,
      layouts,
      exposedProperties: exposedProperties ?? [],
      dependencies: dependencies ?? [],
      changelog: version.changelog,
      authorId: version.author_id,
      createdAt:
        version.created_at instanceof Date
          ? version.created_at.toISOString()
          : String(version.created_at),
    };
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "component";

    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await this.db
        .selectFrom("component_definitions")
        .where("slug", "=", slug)
        .select("id")
        .executeTakeFirst();
      if (!existing) return slug;
      slug = `${baseSlug}-${counter++}`;
    }
  }
}
