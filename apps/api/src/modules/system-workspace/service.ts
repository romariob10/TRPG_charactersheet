import { randomUUID } from "node:crypto";
import type {
  MaterialFileType,
  SystemMaterial,
  SystemWorkspaceResponse,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { ObjectStorage } from "@mycharacter/storage";
import type { Kysely } from "kysely";
import { AppError } from "../../errors.js";

const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;

interface DetectedFile {
  type: MaterialFileType;
  extension: string;
  contentType: string;
}

// AGENTS.md: trust the file's signature, not the client-provided MIME type.
function detectFile(bytes: Uint8Array): DetectedFile | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return { type: "pdf", extension: "pdf", contentType: "application/pdf" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { type: "image", extension: "png", contentType: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { type: "image", extension: "jpg", contentType: "image/jpeg" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { type: "image", extension: "webp", contentType: "image/webp" };
  }
  return null;
}

interface ResolvedSystemTarget {
  targetId: string;
  systemId: string | null;
  templateId: string | null;
  title: string;
  gameSystemName: string | null;
  ownerId: string;
}

export class SystemWorkspaceService {
  private readonly db: Kysely<Database>;
  private readonly storage: ObjectStorage;

  constructor(database: Kysely<Database>, storage: ObjectStorage) {
    this.db = database;
    this.storage = storage;
  }

  private async resolveSystem(id: string): Promise<ResolvedSystemTarget> {
    // 1. Check game_systems by id
    const gs = await this.db
      .selectFrom("game_systems")
      .select(["id", "title", "owner_id as ownerId", "legacy_template_id as legacyTemplateId", "deleted_at as deletedAt"])
      .where("id", "=", id)
      .executeTakeFirst();

    if (gs && gs.deletedAt === null) {
      return {
        targetId: gs.id,
        systemId: gs.id,
        templateId: gs.legacyTemplateId,
        title: gs.title,
        gameSystemName: gs.title,
        ownerId: gs.ownerId ?? "",
      };
    }

    // 2. Check pdf_templates by id
    const template = await this.db
      .selectFrom("pdf_templates")
      .select(["id", "title", "owner_id as ownerId", "game_system as gameSystem", "deleted_at as deletedAt"])
      .where("id", "=", id)
      .executeTakeFirst();

    if (template && template.deletedAt === null) {
      // Find linked game_systems row
      const linkedGs = await this.db
        .selectFrom("game_systems")
        .select(["id", "deleted_at as deletedAt"])
        .where("legacy_template_id", "=", template.id)
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      return {
        targetId: template.id,
        systemId: linkedGs?.id ?? null,
        templateId: template.id,
        title: template.title,
        gameSystemName: template.gameSystem ?? null,
        ownerId: template.ownerId,
      };
    }

    throw new AppError("SYSTEM_NOT_FOUND", 404, "System not found.");
  }

  private async requireOwner(userId: string, id: string): Promise<ResolvedSystemTarget> {
    const target = await this.resolveSystem(id);
    if (target.ownerId !== userId) {
      throw new AppError("SYSTEM_NOT_FOUND", 404, "System not found.");
    }
    return target;
  }

  async getWorkspace(
    userId: string,
    id: string,
  ): Promise<SystemWorkspaceResponse> {
    const target = await this.requireOwner(userId, id);

    const [characterRows, postRows, materials, sheetRows] = await Promise.all([
      this.db
        .selectFrom("characters")
        .select(["id", "name", "slug", "is_public as isPublic"])
        .where((eb) => {
          const conditions = [];
          if (target.systemId) conditions.push(eb("system_id", "=", target.systemId));
          if (target.templateId) conditions.push(eb("template_id", "=", target.templateId));
          return eb.or(conditions);
        })
        .where("deleted_at", "is", null)
        .where("status", "=", "active")
        .orderBy("updated_at", "desc")
        .execute(),
      this.db
        .selectFrom("posts as p")
        .innerJoin("profiles as author", "author.id", "p.author_id")
        .select([
          "p.id",
          "p.title",
          "p.plain_text as plainText",
          "p.slug",
          "author.username as authorUsername",
          "p.created_at as createdAt",
        ])
        .where((eb) => {
          const conditions = [];
          if (target.systemId) {
            conditions.push(eb("p.game_system_id", "=", target.systemId));
            conditions.push(eb("p.system_id", "=", target.systemId));
          }
          if (target.templateId) {
            conditions.push(eb("p.system_id", "=", target.templateId));
          }
          return eb.or(conditions);
        })
        .where("p.deleted_at", "is", null)
        .orderBy("p.created_at", "desc")
        .execute(),
      this.listMaterials(userId, id),
      target.systemId
        ? this.db
            .selectFrom("sheet_definitions as sd")
            .leftJoin("sheet_versions as sv", "sv.id", "sd.current_version_id")
            .select([
              "sd.id",
              "sd.title",
              "sd.kind",
              "sd.description",
              "sd.current_version_id as currentVersionId",
              "sd.created_at as createdAt",
              "sd.updated_at as updatedAt",
              "sv.version_number as currentVersionNumber",
            ])
            .where("sd.system_id", "=", target.systemId)
            .where("sd.deleted_at", "is", null)
            .orderBy("sd.updated_at", "desc")
            .execute()
        : Promise.resolve([]),
    ]);

    return {
      system: {
        id: target.targetId,
        title: target.title,
        gameSystem: target.gameSystemName,
        isOwner: true,
      },
      characters: characterRows.map((row) => ({
        id: String(row.id),
        name: row.name,
        slug: String(row.slug),
        isPublic: Boolean(row.isPublic),
      })),
      posts: postRows.map((row) => ({
        id: String(row.id),
        title: row.title,
        excerpt: row.plainText.slice(0, 160),
        authorUsername: row.authorUsername,
        slug: row.slug,
        createdAt: row.createdAt.toISOString(),
      })),
      materials: materials.materials,
      sheets: sheetRows.map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind as any,
        description: row.description,
        currentVersionId: row.currentVersionId,
        currentVersionNumber: row.currentVersionNumber,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : String(row.createdAt),
        updatedAt:
          row.updatedAt instanceof Date
            ? row.updatedAt.toISOString()
            : String(row.updatedAt),
      })),
    };
  }

  async listMaterials(
    userId: string,
    id: string,
  ): Promise<{ materials: SystemMaterial[] }> {
    const target = await this.requireOwner(userId, id);
    const rows = await this.db
      .selectFrom("system_materials")
      .select([
        "id",
        "template_id as templateId",
        "system_id as systemId",
        "title",
        "file_type as fileType",
        "size_bytes as sizeBytes",
        "created_at as createdAt",
      ])
      .where((eb) => {
        const conditions = [];
        if (target.systemId) conditions.push(eb("system_id", "=", target.systemId));
        if (target.templateId) conditions.push(eb("template_id", "=", target.templateId));
        return eb.or(conditions);
      })
      .orderBy("created_at", "desc")
      .execute();
    return {
      materials: rows.map((row) => this.toMaterial(row, target.targetId)),
    };
  }

  async uploadMaterial(
    userId: string,
    id: string,
    input: { title: string; bytes: Uint8Array },
  ): Promise<SystemMaterial> {
    const target = await this.requireOwner(userId, id);
    const title = input.title.trim();
    if (!title) {
      throw new AppError("VALIDATION_FAILED", 400, "A title is required.");
    }
    if (input.bytes.byteLength === 0) {
      throw new AppError("VALIDATION_FAILED", 400, "The file is empty.");
    }
    if (input.bytes.byteLength > MAX_MATERIAL_BYTES) {
      throw new AppError("MATERIAL_TOO_LARGE", 413, "Material is larger than 25 MB.");
    }
    const detected = detectFile(input.bytes);
    if (!detected) {
      throw new AppError(
        "UNSUPPORTED_MATERIAL_TYPE",
        415,
        "Only PDF, PNG, JPEG and WebP files are supported.",
      );
    }

    const materialId = randomUUID();
    const storagePath = `materials/${materialId.slice(0, 2)}/${target.targetId}/${materialId}.${detected.extension}`;
    await this.storage.put(storagePath, input.bytes);

    try {
      const row = await this.db
        .insertInto("system_materials")
        .values({
          id: materialId,
          system_id: target.systemId ?? null,
          template_id: target.templateId ?? null,
          uploader_id: userId,
          title,
          storage_path: storagePath,
          file_type: detected.type,
          size_bytes: input.bytes.byteLength,
        })
        .returning([
          "id",
          "template_id as templateId",
          "system_id as systemId",
          "title",
          "file_type as fileType",
          "size_bytes as sizeBytes",
          "created_at as createdAt",
        ])
        .executeTakeFirstOrThrow();
      return this.toMaterial(row, target.targetId);
    } catch (error) {
      await this.storage.delete(storagePath).catch(() => undefined);
      throw error;
    }
  }

  async deleteMaterial(
    userId: string,
    id: string,
    materialId: string,
  ): Promise<void> {
    const target = await this.requireOwner(userId, id);
    const row = await this.db
      .selectFrom("system_materials")
      .select(["id", "storage_path as storagePath"])
      .where("id", "=", materialId)
      .where((eb) => {
        const conditions = [];
        if (target.systemId) conditions.push(eb("system_id", "=", target.systemId));
        if (target.templateId) conditions.push(eb("template_id", "=", target.templateId));
        return eb.or(conditions);
      })
      .executeTakeFirst();
    if (!row) {
      throw new AppError("MATERIAL_NOT_FOUND", 404, "Material not found.");
    }
    await this.db
      .deleteFrom("system_materials")
      .where("id", "=", materialId)
      .execute();
    await this.storage.delete(row.storagePath).catch(() => undefined);
  }

  async openMaterial(
    userId: string,
    id: string,
    materialId: string,
  ): Promise<{
    storagePath: string;
    material: SystemMaterial;
    contentType: string;
    sizeBytes: number;
    openStream: () => Promise<{
      stream: NodeJS.ReadableStream & AsyncIterable<Buffer | string>;
    }>;
  }> {
    const target = await this.requireOwner(userId, id);
    const row = await this.db
      .selectFrom("system_materials")
      .select([
        "id",
        "template_id as templateId",
        "system_id as systemId",
        "title",
        "file_type as fileType",
        "size_bytes as sizeBytes",
        "storage_path as storagePath",
        "created_at as createdAt",
      ])
      .where("id", "=", materialId)
      .where((eb) => {
        const conditions = [];
        if (target.systemId) conditions.push(eb("system_id", "=", target.systemId));
        if (target.templateId) conditions.push(eb("template_id", "=", target.templateId));
        return eb.or(conditions);
      })
      .executeTakeFirst();

    if (!row) {
      throw new AppError("MATERIAL_NOT_FOUND", 404, "Material not found.");
    }

    const material = this.toMaterial(row, target.targetId);
    const contentType =
      row.fileType === "pdf"
        ? "application/pdf"
        : row.storagePath.endsWith(".png")
          ? "image/png"
          : row.storagePath.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg";

    return {
      storagePath: row.storagePath,
      material,
      contentType,
      sizeBytes: Number(row.sizeBytes),
      openStream: async () => {
        const opened = await this.storage.open(row.storagePath);
        return {
          stream: opened.stream,
        };
      },
    };
  }

  async filePost(
    userId: string,
    postId: string,
    systemId: string | null,
  ): Promise<void> {
    const post = await this.db
      .selectFrom("posts")
      .select(["id", "author_id as authorId"])
      .where("id", "=", postId)
      .executeTakeFirst();
    if (!post || post.authorId !== userId) {
      throw new AppError("POST_NOT_FOUND", 404, "Post not found.");
    }
    if (systemId) {
      const target = await this.requireOwner(userId, systemId);
      await this.db
        .updateTable("posts")
        .set({
          system_id: target.templateId ?? target.systemId,
          game_system_id: target.systemId ?? null,
          updated_at: new Date(),
        })
        .where("id", "=", postId)
        .execute();
    } else {
      await this.db
        .updateTable("posts")
        .set({
          system_id: null,
          game_system_id: null,
          updated_at: new Date(),
        })
        .where("id", "=", postId)
        .execute();
    }
  }

  private toMaterial(row: {
    id: string;
    templateId?: string | null;
    systemId?: string | null;
    title: string;
    fileType: string;
    sizeBytes: number;
    createdAt: Date | string;
  }, fallbackSystemId: string = ""): SystemMaterial {
    const parentId = row.templateId ? String(row.templateId) : row.systemId ? String(row.systemId) : fallbackSystemId;
    return {
      id: String(row.id),
      templateId: parentId,
      title: row.title,
      fileType: row.fileType as MaterialFileType,
      sizeBytes: Number(row.sizeBytes),
      url: `/api/systems/${parentId}/materials/${row.id}/download`,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    };
  }
}
