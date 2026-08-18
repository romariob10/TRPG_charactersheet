import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { FilesystemStorage } from "../src/filesystem-storage.js";
import { createConfiguredStorage, S3Storage } from "../src/s3-storage.js";

const key =
  "post-images/ab/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png";

describe("S3Storage", () => {
  it("stores, reads ranges, stats, and deletes objects under a prefix", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof HeadObjectCommand) {
        return {
          ContentLength: 4,
          LastModified: new Date("2026-08-18T00:00:00Z"),
        };
      }
      if (command instanceof GetObjectCommand) {
        return { Body: Readable.from([Buffer.from("data")]), ContentLength: 4 };
      }
      return {};
    });
    const storage = new S3Storage({
      bucket: "test-bucket",
      region: "us-east-1",
      prefix: "/app/",
      client: { send } as unknown as S3Client,
    });

    await expect(storage.put(key, Buffer.from("data"))).resolves.toMatchObject({
      size: 4,
    });
    await expect(storage.stat(key)).resolves.toMatchObject({ size: 4 });
    await expect(
      storage.open(key, { start: 1, end: 2 }),
    ).resolves.toMatchObject({
      path: `s3://test-bucket/app/${key}`,
      size: 4,
    });
    await expect(storage.delete(key)).resolves.toBeUndefined();

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(HeadObjectCommand);
    expect((send.mock.calls[2]?.[0] as GetObjectCommand).input).toMatchObject({
      Bucket: "test-bucket",
      Key: `app/${key}`,
      Range: "bytes=1-2",
    });
    expect(send.mock.calls[3]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it("keeps filesystem storage as the default", () => {
    expect(
      createConfiguredStorage({}, "/tmp/mycharacter-storage-test"),
    ).toBeInstanceOf(FilesystemStorage);
  });

  it("selects S3 when a bucket is configured", () => {
    expect(
      createConfiguredStorage({
        S3_BUCKET: "bucket",
        S3_REGION: "eu-central-1",
      }),
    ).toBeInstanceOf(S3Storage);
  });
});
