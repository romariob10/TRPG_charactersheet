import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance, FastifyReply } from "fastify";
import { filePostRequestSchema } from "@mycharacter/contracts";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import { SystemWorkspaceService } from "./service.js";

export async function registerSystemWorkspaceRoutes(
  app: FastifyInstance,
): Promise<void> {
  const service = new SystemWorkspaceService(app.db, app.storage);

  app.get("/api/systems/:id/workspace", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    const id = (request.params as { id: string }).id;
    return service.getWorkspace(actor.userId, id);
  });

  app.get("/api/systems/:id/materials", async (request, reply) => {
    const actor = requireActor(request);
    reply.header("Cache-Control", "private, no-store");
    const id = (request.params as { id: string }).id;
    return service.listMaterials(actor.userId, id);
  });

  app.post("/api/systems/:id/materials", async (request, reply) => {
    const actor = requireActor(request);
    const id = (request.params as { id: string }).id;
    const input = await parseMaterialUpload(request.parts());
    const material = await service.uploadMaterial(actor.userId, id, input);
    return reply.status(201).send(material);
  });

  app.delete("/api/systems/:id/materials/:materialId", async (request) => {
    const actor = requireActor(request);
    const { id, materialId } = request.params as {
      id: string;
      materialId: string;
    };
    await service.deleteMaterial(actor.userId, id, materialId);
    return { success: true };
  });

  app.get(
    "/api/systems/:id/materials/:materialId/download",
    async (request, reply) => {
      const actor = requireActor(request);
      const { id, materialId } = request.params as {
        id: string;
        materialId: string;
      };
      const { storagePath, contentType } = await service.openMaterial(
        actor.userId,
        id,
        materialId,
      );
      return sendMaterial(app, reply, storagePath, contentType);
    },
  );

  app.put("/api/posts/:postId/system", async (request) => {
    const actor = requireActor(request);
    const { postId } = request.params as { postId: string };
    const parsed = filePostRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", 400, "Invalid system reference.");
    }
    await service.filePost(actor.userId, postId, parsed.data.systemId);
    return { success: true };
  });
}

async function parseMaterialUpload(
  parts: AsyncIterableIterator<
    MultipartFile | import("@fastify/multipart").MultipartValue
  >,
): Promise<{ title: string; bytes: Uint8Array }> {
  let title = "";
  let bytes: Uint8Array | undefined;
  for await (const part of parts) {
    if (part.type === "file") {
      if (bytes) {
        throw new AppError("VALIDATION_FAILED", 400, "Only one file is allowed.");
      }
      bytes = await part.toBuffer();
    } else if (part.fieldname === "title") {
      title = String(part.value);
    }
  }
  if (!bytes) {
    throw new AppError("VALIDATION_FAILED", 400, "A file is required.");
  }
  return { title, bytes };
}

async function sendMaterial(
  app: FastifyInstance,
  reply: FastifyReply,
  storagePath: string,
  contentType: string,
) {
  let metadata;
  try {
    metadata = await app.storage.stat(storagePath);
  } catch {
    throw new AppError("MATERIAL_NOT_FOUND", 404, "Material not found.");
  }
  let opened;
  try {
    opened = await app.storage.open(storagePath, {});
  } catch {
    throw new AppError("MATERIAL_NOT_FOUND", 404, "Material not found.");
  }
  reply
    .status(200)
    .header("cache-control", "private, no-store")
    .header("content-type", contentType)
    .header("content-length", String(metadata.size));
  return reply.send(opened.stream);
}
