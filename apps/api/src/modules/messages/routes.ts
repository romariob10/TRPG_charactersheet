import {
  sendMessageRequestSchema,
  startConversationRequestSchema,
} from "@mycharacter/contracts";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { globalRateLimiter } from "../../plugins/rate-limit.js";
import { DirectMessageService } from "./service.js";

const MAX_MESSAGE_IMAGE_BYTES = 8 * 1024 * 1024;

export async function registerDirectMessageRoutes(app: FastifyInstance): Promise<void> {
  const service = new DirectMessageService(app.db);

  app.get("/api/messages/conversations", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    return service.listConversations(actor.userId);
  });

  app.post("/api/messages/conversations", async (request, reply) => {
    const actor = requireActor(request);
    const body = startConversationRequestSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid recipient username.");
    }

    const targetProfile = await app.db
      .selectFrom("profiles")
      .select("id")
      .where("username", "=", body.data.recipientUsername.toLowerCase().trim())
      .executeTakeFirst();

    if (!targetProfile) {
      throw new AppError("USER_NOT_FOUND", 404, "Target recipient not found.");
    }

    const convId = await service.getOrCreateConversation(actor.userId, targetProfile.id);

    if (body.data.message) {
      await service.sendMessage(actor.userId, convId, body.data.message);
    }

    reply.status(201);
    return { conversationId: convId };
  });

  app.get("/api/messages/conversations/:id", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    const id = (request.params as { id: string }).id;
    const messages = await service.getMessages(actor.userId, id);
    return { messages };
  });

  app.post("/api/messages/conversations/:id", async (request, reply) => {
    const actor = requireActor(request);
    globalRateLimiter.assertLimit("messages:" + actor.userId, 30, 60000);
    const id = (request.params as { id: string }).id;
    const body = sendMessageRequestSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Message body cannot be empty.");
    }

    const msg = await service.sendMessage(actor.userId, id, body.data.body);
    reply.status(201);
    return msg;
  });

  app.post(
    "/api/messages/conversations/:id/images",
    async (request, reply) => {
      const actor = requireActor(request);
      globalRateLimiter.assertLimit(
        "message-images:" + actor.userId,
        20,
        60_000,
      );
      const conversationId = (request.params as { id: string }).id;
      await assertConversationParticipant(
        app,
        conversationId,
        actor.userId,
      );

      const upload = await request.file();
      if (!upload) {
        throw new AppError(
          "MESSAGE_IMAGE_REQUIRED",
          400,
          "An image is required.",
        );
      }
      const bytes = await upload.toBuffer();
      if (bytes.byteLength > MAX_MESSAGE_IMAGE_BYTES) {
        throw new AppError(
          "MESSAGE_IMAGE_TOO_LARGE",
          413,
          "Message images are limited to 8 MB.",
        );
      }
      const image = detectImage(bytes);
      if (!image) {
        throw new AppError(
          "MESSAGE_IMAGE_INVALID",
          400,
          "Only PNG, JPEG, WebP, and GIF images are supported.",
        );
      }

      const fileId = randomUUID();
      const storageKey = `message-images/${fileId.slice(0, 2)}/${actor.userId}/${fileId}.${image.extension}`;
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
            .insertInto("direct_message_images")
            .values({
              file_id: fileId,
              conversation_id: conversationId,
              uploader_id: actor.userId,
            })
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
        file: { url: `/api/message-images/${fileId}`, id: fileId },
      });
    },
  );

  app.get("/api/message-images/:id", async (request, reply) => {
    const actor = requireActor(request);
    const fileId = (request.params as { id: string }).id;
    const image = await app.db
      .selectFrom("direct_message_images as image")
      .innerJoin("object_files as file", "file.id", "image.file_id")
      .innerJoin(
        "direct_conversations as conversation",
        "conversation.id",
        "image.conversation_id",
      )
      .select([
        "file.storage_key as storageKey",
        "file.media_type as mediaType",
      ])
      .where("image.file_id", "=", fileId)
      .where("file.state", "=", "ready")
      .where((eb) =>
        eb.or([
          eb("conversation.participant_one_id", "=", actor.userId),
          eb("conversation.participant_two_id", "=", actor.userId),
        ]),
      )
      .executeTakeFirst();
    if (!image) {
      throw new AppError(
        "MESSAGE_IMAGE_NOT_FOUND",
        404,
        "Message image not found.",
      );
    }
    const opened = await app.storage.open(image.storageKey).catch(() => null);
    if (!opened) {
      throw new AppError(
        "MESSAGE_IMAGE_NOT_FOUND",
        404,
        "Message image not found.",
      );
    }
    return reply
      .header("content-type", image.mediaType)
      .header("cache-control", "private, max-age=86400")
      .header("content-length", String(opened.size))
      .send(opened.stream);
  });
}

async function assertConversationParticipant(
  app: FastifyInstance,
  conversationId: string,
  userId: string,
): Promise<void> {
  const conversation = await app.db
    .selectFrom("direct_conversations")
    .select("id")
    .where("id", "=", conversationId)
    .where((eb) =>
      eb.or([
        eb("participant_one_id", "=", userId),
        eb("participant_two_id", "=", userId),
      ]),
    )
    .executeTakeFirst();
  if (!conversation) {
    throw new AppError(
      "CONVERSATION_NOT_FOUND",
      404,
      "Conversation not found.",
    );
  }
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
import { createHash, randomUUID } from "node:crypto";
