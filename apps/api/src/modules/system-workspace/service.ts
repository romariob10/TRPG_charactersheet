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

export class SystemWorkspaceService {
  private readonly db: Kysely<Database>;
  private readonly storage: ObjectStorage;

  constructor(database: Kysely<Database>, storage: ObjectStorage) {
    this.db = database;
    this.storage = storage;
  }

  private async requireOwner(userId: string, templateId: string): Promise<void> {
    const template = await this.db
      .selectFrom("pdf_templates")
      .select(["id", "owner_id as ownerId", "deleted_at as deletedAt"])
      .where("id", "=", templateId)
      .executeTakeFirst();
    if (!template || template.deletedAt !== null || template.ownerId !== userId) {
      throw new AppError("SYSTEM_NOT_FOUND", 404, "System not found.");
    }
  }

  async getWorkspace(
    userId: string,
    templateId: string,
  ): Promise<SystemWorkspaceResponse> {
    await this.requireOwner(userId, templateId);

    const template = await this.db
      .selectFrom("pdf_templates")
      .select(["id", "title", "game_system as gameSystem"])
      .where("id", "=", templateId)
      .executeTakeFirstOrThrow();

    const [characterRows, postRows, materials, sheetRows] = await Promise.all([
      this.db
        .selectFrom("characters")
        .select(["id", "name", "slug", "is_public as isPublic"])
        .where("template_id", "=", templateId)
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
        .where("p.system_id", "=", templateId)
        .where("p.deleted_at", "is", null)
        .orderBy("p.created_at", "desc")
        .execute(),
      this.listMaterials(userId, templateId),
      this.db
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
        .where("sd.system_id", "=", templateId)
        .where("sd.deleted_at", "is", null)
        .orderBy("sd.updated_at", "desc")
        .execute(),
    ]);

    return {
      system: {
        id: String(template.id),
        title: template.title,
        gameSystem: template.gameSystem ?? null,
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
    templateId: string,
  ): Promise<{ materials: SystemMaterial[] }> {
    await this.requireOwner(userId, templateId);
    const rows = await this.db
      .selectFrom("system_materials")
      .select([
        "id",
        "template_id as templateId",
        "title",
        "file_type as fileType",
        "size_bytes as sizeBytes",
        "created_at as createdAt",
      ])
      .where("template_id", "=", templateId)
      .orderBy("created_at", "desc")
      .execute();
    return {
      materials: rows.map((row) => this.toMaterial(row)),
    };
  }

  async uploadMaterial(
    userId: string,
    templateId: string,
    input: { title: string; bytes: Uint8Array },
  ): Promise<SystemMaterial> {
    await this.requireOwner(userId, templateId);
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
    const storagePath = `materials/${materialId.slice(0, 2)}/${templateId}/${materialId}.${detected.extension}`;
    await this.storage.put(storagePath, input.bytes);

    try {
      const row = await this.db
        .insertInto("system_materials")
        .values({
          id: materialId,
          template_id: templateId,
          uploader_id: userId,
          title,
          storage_path: storagePath,
          file_type: detected.type,
          size_bytes: input.bytes.byteLength,
        })
        .returning([
          "id",
          "template_id as templateId",
          "title",
          "file_type as fileType",
          "size_bytes as sizeBytes",
          "created_at as createdAt",
        ])
        .executeTakeFirstOrThrow();
      return this.toMaterial(row);
    } catch (error) {
      // Keep storage and the database consistent: drop the object if the row
      // could not be written.
      await this.storage.delete(storagePath).catch(() => undefined);
      throw error;
    }
  }

  async deleteMaterial(
    userId: string,
    templateId: string,
    materialId: string,
  ): Promise<void> {
    await this.requireOwner(userId, templateId);
    const row = await this.db
      .selectFrom("system_materials")
      .select(["id", "storage_path as storagePath"])
      .where("id", "=", materialId)
      .where("template_id", "=", templateId)
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
    templateId: string,
    materialId: string,
  ): Promise<{ storagePath: string; contentType: string }> {
    await this.requireOwner(userId, templateId);
    const row = await this.db
      .selectFrom("system_materials")
      .select(["storage_path as storagePath", "file_type as fileType"])
      .where("id", "=", materialId)
      .where("template_id", "=", templateId)
      .executeTakeFirst();
    if (!row) {
      throw new AppError("MATERIAL_NOT_FOUND", 404, "Material not found.");
    }
    const contentType =
      row.fileType === "pdf" ? "application/pdf" : "application/octet-stream";
    return { storagePath: row.storagePath, contentType };
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
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!post) {
      throw new AppError("POST_NOT_FOUND", 404, "Post not found.");
    }
    if (post.authorId !== userId) {
      throw new AppError("FORBIDDEN", 403, "You can only file your own posts.");
    }
    if (systemId !== null) {
      await this.requireOwner(userId, systemId);
    }
    await this.db
      .updateTable("posts")
      .set({ system_id: systemId })
      .where("id", "=", postId)
      .execute();
  }

  private toMaterial(row: {
    id: string | { toString(): string };
    templateId: string | { toString(): string };
    title: string;
    fileType: string;
    sizeBytes: number;
    createdAt: Date;
  }): SystemMaterial {
    const id = String(row.id);
    const templateId = String(row.templateId);
    return {
      id,
      templateId,
      title: row.title,
      fileType: row.fileType === "image" ? "image" : "pdf",
      sizeBytes: row.sizeBytes,
      url: `/api/systems/${templateId}/materials/${id}/download`,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
