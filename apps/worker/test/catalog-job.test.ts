import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PgBoss } from "pg-boss";
import {
  buildVisionCatalogPrompt,
  processCatalogJob,
  selectVisionPages,
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
    analyzeWithVision: vi
      .fn()
      .mockRejectedValue(new Error("provider unavailable")),
    persist: vi.fn().mockResolvedValue(undefined),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("catalog worker", () => {
  it("uses the visible document language for every persisted field label", async () => {
    const deps = dependencies();
    const baseField = {
      id: randomUUID(),
      pdfName: "strength",
      kind: "text" as const,
      defaultValue: null,
      options: [],
      page: 1,
      label: "strength",
      aliases: [],
      section: "Attributes",
      groupId: null,
      groupOrder: null,
      confidence: 0,
      source: "pdf" as const,
      widgets: [
        {
          page: 1,
          rect: [0.1, 0.1, 0.2, 0.2] as [number, number, number, number],
          pdfRect: [10, 10, 20, 20] as [number, number, number, number],
          rotation: 0,
          exportValue: null,
          widgetIndex: 0,
        },
      ],
    };
    vi.mocked(deps.extract).mockResolvedValue({
      fields: [
        baseField,
        {
          ...baseField,
          id: randomUUID(),
          pdfName: "unknownMetadataName",
          label: "unknownMetadataName",
        },
      ],
      tokens: [
        {
          text: "Имя персонажа Сила Ловкость Телосложение",
          page: 1,
          rect: [0.75, 0.75, 0.95, 0.8],
          fontSize: 12,
          source: "pdf",
        },
      ],
    });
    vi.mocked(deps.analyzeWithVision).mockImplementation(
      async (_bytes, fields) => fields,
    );

    await processCatalogJob(
      { templateId: randomUUID(), catalogJobId: randomUUID() },
      deps,
    );

    expect(deps.analyzeWithVision).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.any(Array),
      expect.any(Array),
      "ru",
    );
    const persisted = vi.mocked(deps.persist).mock.calls[0][1];
    expect(persisted.map((field) => field.label)).toEqual([
      "Сила",
      "Текстовое поле 1",
    ]);
    expect(persisted.every((field) => field.section === "Общее")).toBe(true);
  });

  it("instructs vision to translate hidden metadata into the sheet language", () => {
    const prompt = buildVisionCatalogPrompt({
      page: 1,
      context: [
        {
          fieldId: randomUUID(),
          technicalName: "strength",
          currentLabel: "strength",
          currentSection: null,
          kind: "text",
          rect: [0.1, 0.1, 0.2, 0.2],
        },
      ],
      visibleText: [{ text: "Сила", rect: [0.01, 0.1, 0.09, 0.2] }],
      documentLanguage: "ru",
    });

    expect(prompt).toContain("MUST be natural Russian written in Cyrillic");
    expect(prompt).toContain("technicalName is an internal identifier only");
    expect(prompt).toContain("exactly one entry for every supplied fieldId");
    expect(prompt).toContain("responsive interactive sheet");
    expect(prompt).toContain("natural visual reading order");
    expect(prompt).toContain("ability value plus modifier/check/save");
    expect(prompt).toContain("current plus maximum resource pair");
    expect(prompt).toContain("repeated table series");
    expect(prompt).toContain(
      "Never group fields merely because they are nearby",
    );
  });

  it("asks vision to structure every page for the adaptive sheet", () => {
    const first = {
      id: randomUUID(),
      pdfName: "hero_name",
      kind: "text" as const,
      defaultValue: null,
      options: [],
      page: 1,
      label: "Hero name",
      aliases: [],
      section: "Identity",
      groupId: null,
      groupOrder: null,
      confidence: 0.99,
      source: "pdf" as const,
      widgets: [
        {
          page: 1,
          rect: [0.1, 0.1, 0.2, 0.2] as [number, number, number, number],
          pdfRect: [10, 10, 20, 20] as [number, number, number, number],
          rotation: 0,
          exportValue: null,
          widgetIndex: 0,
        },
      ],
    };

    expect(
      selectVisionPages([
        first,
        {
          ...first,
          id: randomUUID(),
          pdfName: "notes",
          page: 2,
          widgets: [{ ...first.widgets[0], page: 2 }],
        },
      ]),
    ).toEqual([1, 2]);
  });

  it("keeps deterministic catalog data when vision fails", async () => {
    const deps = dependencies();
    const result = await processCatalogJob(
      { templateId: randomUUID(), catalogJobId: randomUUID() },
      deps,
    );

    expect(result.status).toBe("partial");
    expect(deps.persist).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ pdfName: "strength" }),
      ]),
      expect.any(String),
    );
    expect(deps.complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "partial",
      "Vision analysis was incomplete: provider unavailable",
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
