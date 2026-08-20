import { createHash, randomUUID } from "node:crypto";
import {
  createPostCommentRequestSchema,
  createPostRequestSchema,
  postReactionSchema,
} from "@mycharacter/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { PostService } from "./service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const interactionRateLimit = {
  max: 30,
  timeWindow: 60_000,
  keyGenerator: (request: FastifyRequest) =>
    request.actor?.userId ?? request.ip,
  errorResponseBuilder: () =>
    new AppError(
      "RATE_LIMITED",
      429,
      "Too many post interactions. Please try again later.",
    ),
};

export async function registerPostRoutes(app: FastifyInstance): Promise<void> {
  const service = new PostService(app.db);

  app.get("/api/posts", async (request) => {
    const actor = requireActor(request);
    return { posts: await service.list(actor.userId) };
  });

  app.get("/api/posts/saved", async (request) => {
    const actor = requireActor(request);
    return { posts: await service.listSaved(actor.userId) };
  });

  app.get("/api/posts/embed-options", async (request) => {
    const actor = requireActor(request);
    return service.listEmbedOptions(actor.userId);
  });

  app.post("/api/posts", async (request, reply) => {
    const actor = requireActor(request);
    const input = createPostRequestSchema.safeParse(request.body);
    if (!input.success) throw validationError();
    return reply
      .status(201)
      .send(await service.create(actor.userId, input.data.blocks));
  });

  app.patch("/api/posts/:id", async (request) => {
    const actor = requireActor(request);
    const postId = parseUuid(request.params, "id");
    const input = createPostRequestSchema.safeParse(request.body);
    if (!input.success) throw validationError();
    return service.update(actor.userId, postId, input.data.blocks);
  });

  app.delete("/api/posts/:id", async (request, reply) => {
    const actor = requireActor(request);
    const postId = parseUuid(request.params, "id");
    await service.delete(actor.userId, postId);
    return reply.status(204).send();
  });

  app.post("/api/posts/images", async (request, reply) => {
    const actor = requireActor(request);
    const upload = await request.file();
    if (!upload)
      throw new AppError("POST_IMAGE_REQUIRED", 400, "An image is required.");
    const bytes = await upload.toBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new AppError(
        "POST_IMAGE_TOO_LARGE",
        413,
        "Post images are limited to 8 MB.",
      );
    }
    const image = detectImage(bytes);
    if (!image) {
      throw new AppError(
        "POST_IMAGE_INVALID",
        400,
        "Only PNG, JPEG, WebP, and GIF images are supported.",
      );
    }
    const fileId = randomUUID();
    const storageKey = `post-images/${fileId.slice(0, 2)}/${actor.userId}/${fileId}.${image.extension}`;
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
    try {
      await app.storage.put(storageKey, bytes);
      await app.db.transaction().execute(async (trx) => {
        await trx
          .insertInto("post_images")
          .values({ file_id: fileId, uploader_id: actor.userId })
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
    return reply.status(201).send({
      success: 1,
      file: { url: `/api/post-images/${fileId}`, id: fileId },
    });
  });

  app.get("/api/post-images/:id", async (request, reply) => {
    const fileId = parseUuid(request.params, "id");
    const image = await app.db
      .selectFrom("post_images as image")
      .innerJoin("object_files as file", "file.id", "image.file_id")
      .select([
        "image.uploader_id as uploaderId",
        "image.post_id as postId",
        "file.storage_key as storageKey",
        "file.media_type as mediaType",
      ])
      .where("image.file_id", "=", fileId)
      .where("image.post_id", "is not", null)
      .where("file.state", "=", "ready")
      .executeTakeFirst();
    if (!image) {
      throw new AppError("POST_IMAGE_NOT_FOUND", 404, "Post image not found.");
    }
    const opened = await app.storage.open(image.storageKey).catch(() => null);
    if (!opened)
      throw new AppError("POST_IMAGE_NOT_FOUND", 404, "Post image not found.");
    return reply
      .header("content-type", image.mediaType)
      .header(
        "cache-control",
        "public, max-age=31536000, immutable",
      )
      .header("content-length", String(opened.size))
      .send(opened.stream);
  });

  app.get("/api/public/posts/:username/:slug", async (request) => {
    const params = request.params as { username?: unknown; slug?: unknown };
    if (
      typeof params.username !== "string" ||
      !USERNAME_PATTERN.test(params.username) ||
      typeof params.slug !== "string" ||
      !SLUG_PATTERN.test(params.slug) ||
      params.slug.length > 100
    ) {
      throw new AppError("POST_NOT_FOUND", 404, "Post not found.");
    }
    return {
      post: await service.getPublic(
        params.username,
        params.slug,
        request.actor?.userId ?? null,
      ),
    };
  });

  app.put(
    "/api/posts/:id/reactions/:reaction",
    { config: { rateLimit: interactionRateLimit } },
    async (request) => {
      const actor = requireActor(request);
      const { id, reaction } = parseReactionParams(request.params);
      return {
        reactions: await service.addReaction(actor.userId, id, reaction),
      };
    },
  );

  app.delete("/api/posts/:id/reactions/:reaction", async (request) => {
    const actor = requireActor(request);
    const { id, reaction } = parseReactionParams(request.params);
    return {
      reactions: await service.removeReaction(actor.userId, id, reaction),
    };
  });

  app.put("/api/posts/:id/save", async (request) => {
    const actor = requireActor(request);
    const postId = parseUuid(request.params, "id");
    const isSaved = await service.bookmark(actor.userId, postId);
    return { isSaved };
  });

  app.delete("/api/posts/:id/save", async (request) => {
    const actor = requireActor(request);
    const postId = parseUuid(request.params, "id");
    const isSaved = await service.unbookmark(actor.userId, postId);
    return { isSaved };
  });

  app.post("/api/posts/:id/view", async (request) => {
    const postId = parseUuid(request.params, "id");
    const viewsCount = await service.recordView(
      postId,
      request.actor?.userId ?? null,
      request.ip,
    );
    return { viewsCount };
  });

  app.get("/api/posts/:id/comments", async (request) => ({
    comments: await service.listComments(parseUuid(request.params, "id")),
  }));

  app.post(
    "/api/posts/:id/comments",
    { config: { rateLimit: interactionRateLimit } },
    async (request, reply) => {
      const actor = requireActor(request);
      const input = createPostCommentRequestSchema.safeParse(request.body);
      if (!input.success) throw validationError();
      return reply
        .status(201)
        .send(
          await service.addComment(
            actor.userId,
            parseUuid(request.params, "id"),
            input.data.body,
          ),
        );
    },
  );

  app.delete("/api/posts/:id/comments/:commentId", async (request, reply) => {
    const actor = requireActor(request);
    await service.deleteComment(
      actor.userId,
      parseUuid(request.params, "commentId"),
    );
    return reply.status(204).send();
  });
}

function parseReactionParams(value: unknown) {
  const params = value as { id?: unknown; reaction?: unknown };
  const id = parseUuid(params, "id");
  const reaction = postReactionSchema.safeParse(params.reaction);
  if (!reaction.success) throw validationError();
  return { id, reaction: reaction.data };
}

function parseUuid(value: unknown, key: string): string {
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string" || !UUID_PATTERN.test(candidate)) {
    throw validationError();
  }
  return candidate;
}

function detectImage(
  bytes: Uint8Array,
): { extension: string; mediaType: string } | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { extension: "png", mediaType: "image/png" };
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { extension: "jpg", mediaType: "image/jpeg" };
  }
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return { extension: "webp", mediaType: "image/webp" };
  }
  if (
    bytes.length >= 6 &&
    (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")
  ) {
    return { extension: "gif", mediaType: "image/gif" };
  }
  return null;
}

function validationError(): AppError {
  return new AppError("VALIDATION_FAILED", 400, "Request validation failed.");
}
