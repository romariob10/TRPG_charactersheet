import { createHash, randomUUID } from "node:crypto";
import {
  characterIdSchema,
  cloneCharacterRequestSchema,
  createCharacterRequestSchema,
  inviteUserRequestSchema,
  sheetFieldDefinitionSchema,
  updateCharacterRequestSchema,
} from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { CharacterService } from "./service.js";

export async function registerCharacterRoutes(app: FastifyInstance): Promise<void> {
  const service = new CharacterService(app.db);

  app.get("/api/characters", async (request) => {
    const actor = requireActor(request);
    return { items: await service.list(actor.userId) };
  });

  app.post("/api/characters", async (request, reply) => {
    const actor = requireActor(request);
    const input = parse(createCharacterRequestSchema, request.body);
    return reply.status(201).send(await service.create(actor.userId, input));
  });

  app.get("/api/characters/:id", async (request) => {
    const actor = requireActor(request);
    const id = parseId(request.params);
    return service.get(actor.userId, id);
  });

  app.get("/api/characters/:id/editor", async (request) => {
    const actor = requireActor(request);
    return service.getEditor(actor.userId, parseId(request.params));
  });

  app.post(
    "/api/characters/:id/images",
    { bodyLimit: 10 * 1024 * 1024 },
    async (request, reply) => {
      const actor = requireActor(request);
      const characterId = parseId(request.params);
      await service.authorizeCharacter(actor.userId, characterId, "edit");

      const fieldKey = parseImageFieldKey(request.query);
      const version = await app.db
        .selectFrom("characters as character")
        .innerJoin("sheet_versions as version", "version.id", "character.sheet_version_id")
        .select("version.fields")
        .where("character.id", "=", characterId)
        .executeTakeFirst();
      const fields = sheetFieldDefinitionSchema.array().safeParse(version?.fields);
      const imageField = fields.success
        ? fields.data.find(
            (field) => field.key === fieldKey && field.kind === "avatar" && !field.readOnly,
          )
        : undefined;
      if (!imageField) {
        throw new AppError(
          "CHARACTER_IMAGE_FIELD_NOT_FOUND",
          404,
          "Character image field not found.",
        );
      }
      const upload = await request.file();
      if (!upload) {
        throw new AppError(
          "CHARACTER_IMAGE_REQUIRED",
          400,
          "A character image is required.",
        );
      }
      const bytes = await upload.toBuffer();
      if (bytes.byteLength > 8 * 1024 * 1024) {
        throw new AppError(
          "CHARACTER_IMAGE_TOO_LARGE",
          413,
          "Character images are limited to 8 MB.",
        );
      }
      const image = detectCharacterImage(bytes);
      if (!image) {
        throw new AppError(
          "CHARACTER_IMAGE_INVALID",
          400,
          "Only PNG and JPEG character images are supported.",
        );
      }

      const fileId = randomUUID();
      const storageKey = `character-images/${fileId.slice(0, 2)}/${characterId}/${fileId}.${image.extension}`;
      const value = `/api/characters/${characterId}/images/${fileId}`;
      await app.db
        .insertInto("object_files")
        .values({
          id: fileId,
          storage_key: storageKey,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          size_bytes: String(bytes.byteLength),
          media_type: image.mediaType,
          state: "pending",
        })
        .execute();

      let oldImage: { fileId: string; storageKey: string } | undefined;
      try {
        await app.storage.put(storageKey, bytes);
        await app.db.transaction().execute(async (trx) => {
          oldImage = await trx
            .selectFrom("character_images as image")
            .innerJoin("object_files as file", "file.id", "image.file_id")
            .select([
              "image.file_id as fileId",
              "file.storage_key as storageKey",
            ])
            .where("image.character_id", "=", characterId)
            .where("image.field_key", "=", fieldKey)
            .forUpdate()
            .executeTakeFirst();

          if (oldImage) {
            await trx
              .deleteFrom("character_images")
              .where("file_id", "=", oldImage.fileId)
              .execute();
          }
          await trx
            .insertInto("character_images")
            .values({
              file_id: fileId,
              character_id: characterId,
              field_key: fieldKey,
              uploader_id: actor.userId,
            })
            .execute();
          await trx
            .insertInto("character_sheet_field_values")
            .values({
              character_id: characterId,
              field_key: fieldKey,
              value: JSON.stringify(value),
              version: 1,
              updated_by: actor.userId,
            })
            .onConflict((conflict) =>
              conflict.columns(["character_id", "field_key"]).doUpdateSet({
                value: JSON.stringify(value),
                version: (eb) => eb("character_sheet_field_values.version", "+", 1),
                updated_by: actor.userId,
                updated_at: new Date(),
              }),
            )
            .execute();
          await trx
            .updateTable("object_files")
            .set({ state: "ready" })
            .where("id", "=", fileId)
            .execute();
        });
      } catch (error) {
        await app.storage.delete(storageKey).catch(() => undefined);
        await app.db
          .deleteFrom("object_files")
          .where("id", "=", fileId)
          .execute();
        throw error;
      }

      if (oldImage) {
        const deleted = await app.storage
          .delete(oldImage.storageKey)
          .then(() => true)
          .catch(() => false);
        if (deleted) {
          await app.db
            .deleteFrom("object_files")
            .where("id", "=", oldImage.fileId)
            .execute();
        }
      }

      return reply.status(201).send({ file: { id: fileId, url: value } });
    },
  );

  app.get("/api/characters/:id/images/:fileId", async (request, reply) => {
    const actor = requireActor(request);
    const characterId = parseId(request.params);
    await service.authorizeCharacter(actor.userId, characterId, "read");
    const fileId = parseFileId(request.params);
    const image = await app.db
      .selectFrom("character_images as image")
      .innerJoin("object_files as file", "file.id", "image.file_id")
      .select(["file.storage_key as storageKey", "file.media_type as mediaType"])
      .where("image.character_id", "=", characterId)
      .where("image.file_id", "=", fileId)
      .where("file.state", "=", "ready")
      .executeTakeFirst();
    if (!image) {
      throw new AppError(
        "CHARACTER_IMAGE_NOT_FOUND",
        404,
        "Character image not found.",
      );
    }
    const opened = await app.storage.open(image.storageKey).catch(() => null);
    if (!opened) {
      throw new AppError(
        "CHARACTER_IMAGE_NOT_FOUND",
        404,
        "Character image not found.",
      );
    }
    return reply
      .header("content-type", image.mediaType)
      .header("cache-control", "private, max-age=31536000, immutable")
      .header("content-length", String(opened.size))
      .send(opened.stream);
  });

  app.patch("/api/characters/:id", async (request) => {
    const actor = requireActor(request);
    const id = parseId(request.params);
    const input = parse(updateCharacterRequestSchema, request.body);
    return service.update(actor.userId, id, input);
  });

  app.post("/api/characters/:id/clone", async (request, reply) => {
    const actor = requireActor(request);
    const id = parseId(request.params);
    const input = parse(cloneCharacterRequestSchema, request.body ?? {});
    return reply.status(201).send(await service.clone(actor.userId, id, input.name));
  });

  app.post("/api/characters/:id/trash", async (request) => {
    const actor = requireActor(request);
    return service.trash(actor.userId, parseId(request.params));
  });

  app.post("/api/characters/:id/restore", async (request) => {
    const actor = requireActor(request);
    return service.restore(actor.userId, parseId(request.params));
  });

  app.delete("/api/characters/:id", async (request, reply) => {
    const actor = requireActor(request);
    await service.permanentlyDelete(actor.userId, parseId(request.params));
    return reply.status(204).send();
  });

  app.post("/api/characters/:id/invites", async (request, reply) => {
    const actor = requireActor(request);
    return reply
      .status(201)
      .send(await service.createInvite(actor.userId, parseId(request.params)));
  });

  app.post("/api/characters/:id/invite-user", async (request, reply) => {
    const actor = requireActor(request);
    const input = parse(inviteUserRequestSchema, request.body);
    return reply
      .status(201)
      .send(await service.inviteUser(actor.userId, parseId(request.params), input));
  });
}

function parseImageFieldKey(query: unknown): string {
  const value = (query as { fieldKey?: unknown }).fieldKey;
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value)
  ) {
    throw validationError();
  }
  return value;
}

function parseFileId(params: unknown): string {
  const value = (params as { fileId?: unknown }).fileId;
  const parsed = characterIdSchema.safeParse(value);
  if (!parsed.success) throw validationError();
  return parsed.data;
}

function detectCharacterImage(
  bytes: Buffer,
): { extension: "png" | "jpg"; mediaType: "image/png" | "image/jpeg" } | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { extension: "png", mediaType: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", mediaType: "image/jpeg" };
  }
  return null;
}

function parseId(params: unknown): string {
  const value = (params as { id?: unknown }).id;
  const parsed = characterIdSchema.safeParse(value);
  if (!parsed.success) throw validationError();
  return parsed.data;
}

function parse<T>(
  schema: {
    // eslint-disable-next-line no-unused-vars -- The parser accepts an untrusted request body.
    safeParse: (value: unknown) => { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw validationError();
  return parsed.data;
}

function validationError(): AppError {
  return new AppError("VALIDATION_FAILED", 400, "Request validation failed.");
}
