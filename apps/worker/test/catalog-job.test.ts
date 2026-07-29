import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PgBoss } from "pg-boss";
import {
  processCatalogJob,
  type CatalogProcessorDependencies,
} from "../src/jobs/catalog.js";

function dependencies(): CatalogProcessorDependencies {
  return {
    load: vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      allowVision: true,
      ownerId: randomUUID(),
    }),
    extract: vi.fn().mockResolvedValue({
      fields: [
        {
          id: randomUUID(),
          pdfName: "strength",
          kind: "text",
          defaultValue: null,
          options: [],
          page: 1,
          label: "strength",
          aliases: [],
          section: null,
          groupId: null,
          groupOrder: null,
          confidence: 0.5,
          source: "pdf",
          widgets: [
            {
              page: 1,
              rect: [0.1, 0.1, 0.2, 0.2],
              pdfRect: [10, 10, 20, 20],
              rotation: 0,
              exportValue: null,
              widgetIndex: 0,
            },
          ],
        },
      ],
      tokens: [],
    }),
    recognizeWeakPages: vi.fn().mockResolvedValue([]),
    analyzeWithVision: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    persist: vi.fn().mockResolvedValue(undefined),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("catalog worker", () => {
  it("keeps deterministic catalog data when vision fails", async () => {
    const deps = dependencies();
    const result = await processCatalogJob(
      { templateId: randomUUID(), catalogJobId: randomUUID() },
      deps,
    );

    expect(result.status).toBe("partial");
    expect(deps.persist).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ pdfName: "strength" })]),
      expect.any(String),
    );
    expect(deps.complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "partial",
      "Vision analysis was incomplete",
    );
  });

  it("does not enqueue the same active catalog twice", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required.");
    const queue = `catalog-dedup-${randomUUID().slice(0, 8)}`;
    const templateId = randomUUID();
    const boss = new PgBoss({ connectionString: databaseUrl });
    await boss.start();
    try {
      await boss.createQueue(queue, { policy: "short" });
      const first = await boss.send(
        queue,
        { templateId, catalogJobId: randomUUID() },
        { singletonKey: templateId },
      );
      const duplicate = await boss.send(
        queue,
        { templateId, catalogJobId: randomUUID() },
        { singletonKey: templateId },
      );

      expect(first).toEqual(expect.any(String));
      expect(duplicate).toBeNull();
    } finally {
      await boss.deleteQueue(queue);
      await boss.stop({ graceful: true });
    }
  });
});
