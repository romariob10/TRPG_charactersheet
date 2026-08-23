import type { Database } from "@mycharacter/database";
import type {
  AutosaveSheetDraftRequest,
  AutosaveSheetDraftResponse,
  ComponentVersionDetails,
  CreateSheetDefinitionRequest,
  LayoutNode,
  PublishSheetVersionRequest,
  PublishSheetVersionResponse,
  SheetEditorDataResponse,
  SheetVersionSummary,
  WorkspaceSheetSummary,
} from "@mycharacter/contracts";
import {
  defaultBoxProps,
  targetLayoutMapSchema,
  validateLayoutNodeConstraints,
} from "@mycharacter/contracts";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { AppError } from "../../errors.js";

export class SheetBuilderService {
  private readonly db: Kysely<Database>;

  constructor(db: Kysely<Database>) {
    this.db = db;
  }

  async createSheetDefinition(
    userId: string,
    input: CreateSheetDefinitionRequest,
  ): Promise<WorkspaceSheetSummary> {
    const system = await this.db
      .selectFrom("game_systems")
      .where("id", "=", input.systemId)
      .where("deleted_at", "is", null)
      .select(["id", "owner_id"])
      .executeTakeFirst();

    if (!system) {
      throw new AppError("SYSTEM_NOT_FOUND", 404, "Game system not found.");
    }

    if (system.owner_id !== userId) {
      throw new AppError(
        "FORBIDDEN",
        403,
        "Only the system owner can create sheet definitions.",
      );
    }

    const slug = await this.generateUniqueSlug(input.systemId, input.title);

    const inserted = await this.db
      .insertInto("sheet_definitions")
      .values({
        system_id: input.systemId,
        owner_id: userId,
        title: input.title,
        slug,
        kind: input.kind,
        description: input.description,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Initialize default draft
    const defaultRootNode = {
      id: crypto.randomUUID(),
      kind: "frame" as const,
      direction: "vertical" as const,
      gap: 9,
      align: "stretch" as const,
      justify: "start" as const,
      wrap: false,
      collapseAdjacentStrokes: false,
      cornerOrnaments: {
        preset: "none" as const,
        topLeft: true,
        topRight: true,
        bottomRight: true,
        bottomLeft: true,
      },
      box: defaultBoxProps,
      children: [],
    };

    const initialLayouts = {
      mobile: defaultRootNode,
      tablet: defaultRootNode,
      desktop: defaultRootNode,
      print: defaultRootNode,
    };

    await this.db
      .insertInto("sheet_drafts")
      .values({
        sheet_definition_id: inserted.id,
        schema_version: 1,
        revision: 1,
        layouts: JSON.stringify(initialLayouts),
        fields: JSON.stringify([]),
        updated_by: userId,
      })
      .execute();

    return {
      id: inserted.id,
      systemId: inserted.system_id,
      title: inserted.title,
      description: inserted.description ?? "",
      slug: inserted.slug,
      kind: inserted.kind,
      updatedAt:
        inserted.updated_at instanceof Date
          ? inserted.updated_at.toISOString()
          : String(inserted.updated_at),
    };
  }

  async getSheetEditorData(
    userId: string,
    sheetDefinitionId: string,
  ): Promise<SheetEditorDataResponse> {
    const sheet = await this.db
      .selectFrom("sheet_definitions as sd")
      .innerJoin("game_systems as gs", "gs.id", "sd.system_id")
      .where("sd.id", "=", sheetDefinitionId)
      .where("sd.deleted_at", "is", null)
      .where("gs.deleted_at", "is", null)
      .select([
        "sd.id",
        "sd.system_id as systemId",
        "sd.title",
        "sd.slug",
        "sd.kind",
        "sd.description",
        "sd.owner_id as sheetOwnerId",
        "sd.updated_at as updatedAt",
        "gs.id as gsId",
        "gs.title as gsTitle",
        "gs.slug as gsSlug",
        "gs.description as gsDescription",
        "gs.visibility as gsVisibility",
        "gs.owner_id as gsOwnerId",
        "gs.created_at as gsCreatedAt",
        "gs.updated_at as gsUpdatedAt",
      ])
      .executeTakeFirst();

    if (!sheet) {
      throw new AppError("SHEET_NOT_FOUND", 404, "Sheet definition not found.");
    }

    const isOwner = sheet.sheetOwnerId === userId || sheet.gsOwnerId === userId;
    if (!isOwner && sheet.gsVisibility !== "public") {
      throw new AppError("FORBIDDEN", 403, "Access restricted.");
    }

    let draftRow = await this.db
      .selectFrom("sheet_drafts")
      .where("sheet_definition_id", "=", sheetDefinitionId)
      .selectAll()
      .executeTakeFirst();

    if (!draftRow) {
      const defaultRoot = {
        id: crypto.randomUUID(),
        kind: "frame" as const,
        direction: "vertical" as const,
        gap: 9,
        align: "stretch" as const,
        justify: "start" as const,
        wrap: false,
        collapseAdjacentStrokes: false,
        cornerOrnaments: {
          preset: "none" as const,
          topLeft: true,
          topRight: true,
          bottomRight: true,
          bottomLeft: true,
        },
        box: defaultBoxProps,
        children: [],
      };

      const initialLayouts = {
        mobile: defaultRoot,
        tablet: defaultRoot,
        desktop: defaultRoot,
        print: defaultRoot,
      };

      draftRow = await this.db
        .insertInto("sheet_drafts")
        .values({
          sheet_definition_id: sheetDefinitionId,
          schema_version: 1,
          revision: 1,
          layouts: JSON.stringify(initialLayouts),
          fields: JSON.stringify([]),
          updated_by: userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    const versions = await this.db
      .selectFrom("sheet_versions")
      .where("sheet_definition_id", "=", sheetDefinitionId)
      .selectAll()
      .orderBy("version_number", "desc")
      .execute();

    const storedLayouts =
      typeof draftRow.layouts === "string"
        ? JSON.parse(draftRow.layouts)
        : draftRow.layouts;
    const parsedLayouts = targetLayoutMapSchema.parse(storedLayouts);

    const parsedFields =
      typeof draftRow.fields === "string"
        ? JSON.parse(draftRow.fields)
        : draftRow.fields;

    const resolvedComponents = await this.resolveComponentDependencies(parsedLayouts);

    return {
      sheetDefinition: {
        id: sheet.id,
        systemId: sheet.systemId,
        title: sheet.title,
        slug: sheet.slug,
        kind: sheet.kind,
        description: sheet.description ?? "",
        updatedAt:
          sheet.updatedAt instanceof Date
            ? sheet.updatedAt.toISOString()
            : String(sheet.updatedAt),
      },
      system: {
        id: sheet.gsId,
        slug: sheet.gsSlug,
        title: sheet.gsTitle,
        description: sheet.gsDescription ?? "",
        visibility: sheet.gsVisibility,
        isOwner,
        createdAt:
          sheet.gsCreatedAt instanceof Date
            ? sheet.gsCreatedAt.toISOString()
            : String(sheet.gsCreatedAt),
        updatedAt:
          sheet.gsUpdatedAt instanceof Date
            ? sheet.gsUpdatedAt.toISOString()
            : String(sheet.gsUpdatedAt),
        sheetCount: 0,
        characterCount: 0,
        materialCount: 0,
        postCount: 0,
      },
      draft: {
        id: draftRow.id,
        schemaVersion: draftRow.schema_version,
        revision: draftRow.revision,
        layouts: parsedLayouts,
        fields: parsedFields ?? [],
        updatedAt:
          draftRow.updated_at instanceof Date
            ? draftRow.updated_at.toISOString()
            : String(draftRow.updated_at),
      },
      versions: versions.map((v) => ({
        id: v.id,
        sheetDefinitionId: v.sheet_definition_id,
        versionNumber: v.version_number,
        schemaVersion: v.schema_version,
        changelog: v.changelog,
        publishedBy: v.published_by,
        publishedAt:
          v.created_at instanceof Date
            ? v.created_at.toISOString()
            : String(v.created_at),
      })),
      resolvedComponents,
      isOwner,
    };
  }

  async resolveComponentDependencies(
    layouts: Record<string, LayoutNode>,
  ): Promise<Record<string, ComponentVersionDetails>> {
    const resolved: Record<string, ComponentVersionDetails> = {};
    const visitingPath = new Set<string>();

    const extractVersionIdsFromNode = (
      node: LayoutNode,
      collected: Set<string>,
    ) => {
      if (!node || typeof node !== "object") return;
      if (node.kind === "component-instance" && node.componentVersionId) {
        collected.add(node.componentVersionId);
      }
      if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children) {
          extractVersionIdsFromNode(child, collected);
        }
      }
      if ("rowTemplate" in node && node.rowTemplate) {
        extractVersionIdsFromNode(node.rowTemplate, collected);
      }
    };

    const initialIds = new Set<string>();
    if (layouts && typeof layouts === "object") {
      for (const root of Object.values(layouts)) {
        if (root) extractVersionIdsFromNode(root, initialIds);
      }
    }

    const resolveRecursive = async (versionIds: Set<string>) => {
      if (versionIds.size === 0) return;

      const unvisited = Array.from(versionIds).filter((id) => !resolved[id]);
      if (unvisited.length === 0) return;

      const rows = await this.db
        .selectFrom("component_versions")
        .where("id", "in", unvisited)
        .selectAll()
        .execute();

      const foundMap = new Map(rows.map((r) => [r.id, r]));

      for (const id of unvisited) {
        if (visitingPath.has(id)) {
          throw new AppError(
            "CYCLIC_COMPONENT_DEPENDENCY",
            400,
            `Cyclic component dependency detected involving component version ${id}.`,
          );
        }

        const row = foundMap.get(id);
        if (!row) {
          throw new AppError(
            "MISSING_COMPONENT_DEPENDENCY",
            400,
            `Referenced component version ${id} was not found in component library.`,
          );
        }

        visitingPath.add(id);

        const storedLayouts =
          typeof row.layouts === "string" ? JSON.parse(row.layouts) : row.layouts;
        const parsedLayouts = targetLayoutMapSchema.parse(storedLayouts);

        const details: ComponentVersionDetails = {
          id: row.id,
          componentId: row.component_id,
          versionNumber: row.version_number,
          schemaVersion: row.schema_version,
          layouts: parsedLayouts,
          exposedProperties:
            typeof row.exposed_properties === "string"
              ? JSON.parse(row.exposed_properties)
              : (row.exposed_properties ?? []),
          dependencies:
            typeof row.dependencies === "string"
              ? JSON.parse(row.dependencies)
              : (row.dependencies ?? []),
          changelog: row.changelog,
          authorId: row.author_id,
          createdAt:
            row.created_at instanceof Date
              ? row.created_at.toISOString()
              : String(row.created_at),
        };

        resolved[id] = details;

        const nestedIds = new Set<string>();
        if (parsedLayouts && typeof parsedLayouts === "object") {
          for (const componentRoot of Object.values(parsedLayouts)) {
            if (componentRoot && typeof componentRoot === "object") {
              extractVersionIdsFromNode(componentRoot as LayoutNode, nestedIds);
            }
          }
        }

        if (nestedIds.size > 0) {
          await resolveRecursive(nestedIds);
        }

        visitingPath.delete(id);
      }
    };

    await resolveRecursive(initialIds);
    return resolved;
  }

  async autosaveSheetDraft(
    userId: string,
    sheetDefinitionId: string,
    input: AutosaveSheetDraftRequest,
  ): Promise<AutosaveSheetDraftResponse> {
    const sheet = await this.db
      .selectFrom("sheet_definitions as sd")
      .innerJoin("game_systems as gs", "gs.id", "sd.system_id")
      .where("sd.id", "=", sheetDefinitionId)
      .where("sd.deleted_at", "is", null)
      .select(["sd.id", "sd.owner_id as sheetOwnerId", "gs.owner_id as gsOwnerId"])
      .executeTakeFirst();

    if (!sheet) {
      throw new AppError("SHEET_NOT_FOUND", 404, "Sheet definition not found.");
    }

    if (sheet.sheetOwnerId !== userId && sheet.gsOwnerId !== userId) {
      throw new AppError("FORBIDDEN", 403, "Only the owner can edit sheet drafts.");
    }

    const currentDraft = await this.db
      .selectFrom("sheet_drafts")
      .where("sheet_definition_id", "=", sheetDefinitionId)
      .select(["id", "revision"])
      .executeTakeFirst();

    if (!currentDraft) {
      throw new AppError("DRAFT_NOT_FOUND", 404, "Sheet draft not found.");
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
    for (const [targetName, rootNode] of Object.entries(normalizedLayouts)) {
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
      .updateTable("sheet_drafts")
      .set({
        revision: nextRevision,
        layouts: JSON.stringify(normalizedLayouts),
        fields: JSON.stringify(input.fields ?? []),
        updated_by: userId,
        updated_at: now,
      })
      .where("id", "=", currentDraft.id)
      .execute();

    await this.db
      .updateTable("sheet_definitions")
      .set({ updated_at: now })
      .where("id", "=", sheetDefinitionId)
      .execute();

    return {
      revision: nextRevision,
      updatedAt: now.toISOString(),
      valid: validationErrors.length === 0,
      validationErrors,
    };
  }

  async publishSheetVersion(
    userId: string,
    sheetDefinitionId: string,
    input: PublishSheetVersionRequest,
  ): Promise<PublishSheetVersionResponse> {
    const sheet = await this.db
      .selectFrom("sheet_definitions as sd")
      .innerJoin("game_systems as gs", "gs.id", "sd.system_id")
      .where("sd.id", "=", sheetDefinitionId)
      .where("sd.deleted_at", "is", null)
      .select(["sd.id", "sd.owner_id as sheetOwnerId", "gs.owner_id as gsOwnerId"])
      .executeTakeFirst();

    if (!sheet) {
      throw new AppError("SHEET_NOT_FOUND", 404, "Sheet definition not found.");
    }

    if (sheet.sheetOwnerId !== userId && sheet.gsOwnerId !== userId) {
      throw new AppError("FORBIDDEN", 403, "Only the owner can publish versions.");
    }

    const draft = await this.db
      .selectFrom("sheet_drafts")
      .where("sheet_definition_id", "=", sheetDefinitionId)
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
        "All four target layouts (mobile, tablet, desktop, print) are required and must be valid before publication.",
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

    // Resolve and freeze all component dependencies immutably
    const dependenciesSnapshot = await this.resolveComponentDependencies(parsedLayouts.data);

    const latestVersion = await this.db
      .selectFrom("sheet_versions")
      .where("sheet_definition_id", "=", sheetDefinitionId)
      .select(sql<number>`COALESCE(MAX(version_number), 0)`.as("maxVer"))
      .executeTakeFirst();

    const nextVersionNumber = Number(latestVersion?.maxVer ?? 0) + 1;

    const draftFields = draft.fields
      ? typeof draft.fields === "string"
        ? JSON.parse(draft.fields)
        : draft.fields
      : [];

    return this.db.transaction().execute(async (trx) => {
      const published = await trx
        .insertInto("sheet_versions")
        .values({
          sheet_definition_id: sheetDefinitionId,
          version_number: nextVersionNumber,
          schema_version: draft.schema_version,
          layouts: JSON.stringify(parsedLayouts.data),
          fields: JSON.stringify(draftFields),
          dependencies: JSON.stringify(dependenciesSnapshot),
          changelog: input.changelog,
          published_by: userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .updateTable("sheet_definitions")
        .set({
          current_version_id: published.id,
          updated_at: sql`now()`,
        })
        .where("id", "=", sheetDefinitionId)
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

  async listSheetVersions(
    sheetDefinitionId: string,
  ): Promise<SheetVersionSummary[]> {
    const rows = await this.db
      .selectFrom("sheet_versions")
      .where("sheet_definition_id", "=", sheetDefinitionId)
      .selectAll()
      .orderBy("version_number", "desc")
      .execute();

    return rows.map((r) => ({
      id: r.id,
      sheetDefinitionId: r.sheet_definition_id,
      versionNumber: r.version_number,
      schemaVersion: r.schema_version,
      changelog: r.changelog,
      publishedBy: r.published_by,
      publishedAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }

  async getSheetVersion(versionId: string) {
    const version = await this.db
      .selectFrom("sheet_versions as sv")
      .innerJoin("sheet_definitions as sd", "sd.id", "sv.sheet_definition_id")
      .where("sv.id", "=", versionId)
      .selectAll("sv")
      .select(["sd.title as sheetTitle", "sd.system_id as systemId"])
      .executeTakeFirst();

    if (!version) {
      throw new AppError("VERSION_NOT_FOUND", 404, "Sheet version not found.");
    }

    const storedLayouts =
      typeof version.layouts === "string"
        ? JSON.parse(version.layouts)
        : version.layouts;
    const layouts = targetLayoutMapSchema.parse(storedLayouts);

    const fields =
      typeof version.fields === "string"
        ? JSON.parse(version.fields)
        : (version.fields ?? []);

    const dependencies =
      typeof version.dependencies === "string"
        ? JSON.parse(version.dependencies)
        : (version.dependencies ?? {});

    return {
      id: version.id,
      sheetDefinitionId: version.sheet_definition_id,
      sheetTitle: version.sheetTitle,
      systemId: version.systemId,
      versionNumber: version.version_number,
      schemaVersion: version.schema_version,
      layouts,
      fields,
      dependencies,
      changelog: version.changelog,
      publishedBy: version.published_by,
      publishedAt:
        version.created_at instanceof Date
          ? version.created_at.toISOString()
          : String(version.created_at),
    };
  }

  private async generateUniqueSlug(
    systemId: string,
    title: string,
  ): Promise<string> {
    const baseSlug = title
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "sheet";

    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await this.db
        .selectFrom("sheet_definitions")
        .where("system_id", "=", systemId)
        .where("slug", "=", slug)
        .where("deleted_at", "is", null)
        .select("id")
        .executeTakeFirst();
      if (!existing) return slug;
      slug = `${baseSlug}-${counter++}`;
    }
  }
}
