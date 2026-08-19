import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { FilesystemStorage } from "./filesystem-storage.js";
import type {
  ObjectRange,
  ObjectStat,
  ObjectStorage,
  OpenedObject,
} from "./object-storage.js";
import { assertStorageKey, StorageError } from "./storage-key.js";

export interface S3StorageOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  prefix?: string;
  client?: S3Client;
}

export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  public constructor(options: S3StorageOptions) {
    if (!options.bucket.trim()) throw new Error("S3 bucket is required.");
    this.bucket = options.bucket;
    this.prefix = normalizePrefix(options.prefix);

    const config: S3ClientConfig = {
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.forcePathStyle === undefined
        ? {}
        : { forcePathStyle: options.forcePathStyle }),
      ...(options.accessKeyId && options.secretAccessKey
        ? {
            credentials: {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            },
          }
        : {}),
    };
    this.client = options.client ?? new S3Client(config);
  }

  async put(key: string, bytes: Uint8Array): Promise<ObjectStat> {
    assertStorageKey(key);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(key),
          Body: bytes,
        }),
      );
      return { size: bytes.byteLength, modifiedAt: new Date() };
    } catch (error) {
      throw mapS3Error(error, "STORAGE_WRITE_FAILED");
    }
  }

  async stat(key: string): Promise<ObjectStat> {
    assertStorageKey(key);
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(key),
        }),
      );
      return {
        size: result.ContentLength ?? 0,
        modifiedAt: result.LastModified ?? new Date(0),
      };
    } catch (error) {
      throw mapS3Error(error, "STORAGE_NOT_FOUND");
    }
  }

  async open(key: string, range: ObjectRange = {}): Promise<OpenedObject> {
    assertStorageKey(key);
    const rangeHeader = formatRange(range);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(key),
          ...(rangeHeader ? { Range: rangeHeader } : {}),
        }),
      );
      if (!(result.Body instanceof Readable)) {
        throw new StorageError(
          "STORAGE_NOT_FOUND",
          "S3 returned an unreadable body.",
        );
      }
      return {
        path: `s3://${this.bucket}/${this.objectKey(key)}`,
        size: result.ContentLength ?? 0,
        modifiedAt: result.LastModified ?? new Date(0),
        stream: result.Body,
      };
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw mapS3Error(error, "STORAGE_NOT_FOUND");
    }
  }

  async delete(key: string): Promise<void> {
    assertStorageKey(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(key),
        }),
      );
    } catch (error) {
      throw mapS3Error(error, "STORAGE_WRITE_FAILED");
    }
  }

  private objectKey(key: string): string {
    return `${this.prefix}${key}`;
  }
}

export function createConfiguredStorage(
  env: NodeJS.ProcessEnv = process.env,
  filesystemRoot = "/var/lib/mycharacter/pdfs",
): ObjectStorage {
  const bucket = env.S3_BUCKET?.trim();
  if (!bucket) {
    return new FilesystemStorage(env.STORAGE_ROOT ?? filesystemRoot);
  }
  return new S3Storage({
    bucket,
    region: env.S3_REGION?.trim() || "us-east-1",
    endpoint: env.S3_ENDPOINT?.trim() || undefined,
    accessKeyId: env.S3_ACCESS_KEY_ID?.trim() || undefined,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY?.trim() || undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    prefix: env.S3_PREFIX,
  });
}

function normalizePrefix(prefix: string | undefined): string {
  const value = prefix?.trim().replace(/^\/+|\/+$/g, "");
  return value ? `${value}/` : "";
}

function formatRange(range: ObjectRange): string | undefined {
  if (range.start === undefined && range.end === undefined) return undefined;
  return `bytes=${range.start ?? ""}-${range.end ?? ""}`;
}

function mapS3Error(
  error: unknown,
  fallback: "STORAGE_NOT_FOUND" | "STORAGE_WRITE_FAILED",
): StorageError {
  const status =
    typeof error === "object" && error !== null && "$metadata" in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode
      : undefined;
  const code =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  if (status === 404 || code === "NoSuchKey" || code === "NotFound") {
    return new StorageError(
      "STORAGE_NOT_FOUND",
      "Stored object was not found.",
    );
  }
  return new StorageError(fallback, "S3 storage operation failed.", error);
}
