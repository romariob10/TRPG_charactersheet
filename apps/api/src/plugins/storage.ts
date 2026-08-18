import multipart from "@fastify/multipart";
import { createConfiguredStorage, type ObjectStorage } from "@mycharacter/storage";
import "fastify";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  // eslint-disable-next-line no-unused-vars -- TypeScript merges this into FastifyInstance.
  interface FastifyInstance {
    storage: ObjectStorage;
  }
}

export interface StorageOptions {
  storage?: ObjectStorage;
  storageRoot?: string;
}

export async function registerStorage(
  app: FastifyInstance,
  options: StorageOptions,
): Promise<void> {
  const storage =
    options.storage ??
    createConfiguredStorage(process.env, options.storageRoot);
  app.decorate("storage", storage);
  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: 25 * 1024 * 1024,
      fields: 8,
      parts: 9,
    },
  });
}
