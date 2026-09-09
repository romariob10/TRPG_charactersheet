import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createKnowledgeTools,
  loadCharacterKnowledgeContext,
} from "../src/modules/ai/knowledge-tools.js";

describe("RPG knowledge character context", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let database: Kysely<Database>;
  let ownerId: string;
  let strangerId: string;
  let publicId: string;
  let privateId: string;
  let legacyTemplateId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    database = testDb.db as unknown as Kysely<Database>;
    const users = await database.insertInto("users").values([
      { email: "knowledge-owner@example.test", password_hash: "unused" },
      { email: "knowledge-stranger@example.test", password_hash: "unused" },
    ]).returning("id").execute();
    [ownerId, strangerId] = users.map((user) => user.id);
    const file = await database.insertInto("object_files").values({
      storage_key: `tests/${crypto.randomUUID()}.pdf`,
      sha256: "a".repeat(64), size_bytes: "100", media_type: "application/pdf", state: "ready",
    }).returning("id").executeTakeFirstOrThrow();
    const template = await database.insertInto("pdf_templates").values({
      owner_id: ownerId, file_id: file.id, title: "Knowledge fixture", slug: "knowledge-fixture",
      visibility: "private", storage_path: "tests/knowledge.pdf", sha256: "a".repeat(64),
      page_count: 1, catalog_status: "ready",
    }).returning("id").executeTakeFirstOrThrow();
    legacyTemplateId = template.id;
    const publicSystem = await database.insertInto("game_systems").values({
      owner_id: strangerId, title: "D&D", family: "Dungeons & Dragons", edition: "2014",
      slug: "knowledge-public", visibility: "public",
    }).returning("id").executeTakeFirstOrThrow();
    publicId = publicSystem.id;
    const privateSystem = await database.insertInto("game_systems").values({
      owner_id: ownerId, title: "Fate", edition: "core", slug: "knowledge-private",
      visibility: "private", legacy_template_id: template.id,
      description: "Private campaign notes must never be included in retrieval context.",
    }).returning("id").executeTakeFirstOrThrow();
    privateId = privateSystem.id;
  });

  afterAll(async () => {
    if (testDb) await destroyTestDatabase(testDb);
  });

  function context(userId: string, systemId: string | null, templateId: string | null = null) {
    return { database, userId, systemId, templateId };
  }

  it("reads only the exact linked public system without private notes", async () => {
    await expect(loadCharacterKnowledgeContext(context(ownerId, publicId))).resolves.toEqual({
      title: "D&D", family: "Dungeons & Dragons", edition: "2014",
      scope: { systemId: "dnd", edition: "5e-2014" },
    });
  });

  it("enforces owner access for a private system even when a character references it", async () => {
    await expect(loadCharacterKnowledgeContext(context(ownerId, privateId))).resolves.toMatchObject({
      title: "Fate", scope: { systemId: "fate", edition: "core" },
    });
    await expect(loadCharacterKnowledgeContext(context(strangerId, privateId))).resolves.toBeNull();
  });

  it("resolves a legacy template only when there is no canonical system ID", async () => {
    await expect(loadCharacterKnowledgeContext(context(ownerId, null, legacyTemplateId))).resolves.toMatchObject({ title: "Fate" });
    await expect(loadCharacterKnowledgeContext(context(strangerId, null, legacyTemplateId))).resolves.toBeNull();
    await expect(loadCharacterKnowledgeContext(context(ownerId, publicId, legacyTemplateId))).resolves.toMatchObject({ title: "D&D" });
    await expect(loadCharacterKnowledgeContext(context(ownerId, crypto.randomUUID(), legacyTemplateId))).resolves.toBeNull();
    await expect(loadCharacterKnowledgeContext(context(ownerId, null))).resolves.toBeNull();
  });

  it("does not retrieve deleted unofficial systems", async () => {
    const deleted = await database.insertInto("game_systems").values({
      owner_id: ownerId, title: "Fate", edition: "core", slug: "knowledge-deleted",
      visibility: "public", deleted_at: new Date(),
    }).returning("id").executeTakeFirstOrThrow();
    await expect(loadCharacterKnowledgeContext(context(ownerId, deleted.id))).resolves.toBeNull();
  });

  it("adds one read-only tool and applies verified system and edition filters", async () => {
    const tools = createKnowledgeTools(context(ownerId, publicId));
    expect(tools.map((tool) => tool.name)).toEqual(["searchRpgKnowledge"]);
    await expect(tools[0].execute!({ query: "advantage", locale: "en", limit: 1 })).resolves.toMatchObject({
      filters: { systemId: "dnd", edition: "5e-2014" }, needsEdition: false,
      matches: [{ id: "dnd-2014-advantage-en", systemId: "dnd", edition: "5e-2014" }],
    });
    await expect(tools[0].execute!({ query: "aspects", systemId: "fate", edition: "core", limit: 1 })).resolves.toMatchObject({
      filters: { systemId: "fate", edition: "core" }, needsEdition: false,
      matches: [{ id: "fate-core-aspects-en", systemId: "fate", edition: "core" }],
    });
    await expect(tools[0].execute!({ query: "advantage", systemId: "dnd", edition: "2014", limit: 1 })).resolves.toMatchObject({
      filters: { systemId: "dnd", edition: "5e-2014" }, needsEdition: false,
      matches: [{ id: "dnd-2014-advantage-en" }],
    });
    await expect(tools[0].execute!({ query: "aspects", scope: "all", limit: 1 })).resolves.toMatchObject({
      filters: { systemId: null, edition: null }, needsSystem: false,
      matches: [{ id: "fate-core-aspects-en" }],
    });
  });

  it("does not substitute another system when the current system is unknown or inaccessible", async () => {
    const unknownSystem = await database.insertInto("game_systems").values({
      owner_id: ownerId, title: "GURPS", edition: "4e", slug: "knowledge-unknown-system", visibility: "private",
    }).returning("id").executeTakeFirstOrThrow();
    for (const toolContext of [context(ownerId, unknownSystem.id), context(strangerId, privateId), context(ownerId, null)]) {
      await expect(createKnowledgeTools(toolContext)[0].execute!({ query: "skill check" })).resolves.toMatchObject({
        needsSystem: true, matches: [],
      });
    }
  });

  it("requires an edition instead of silently choosing one", async () => {
    const unknownEdition = await database.insertInto("game_systems").values({
      owner_id: ownerId, title: "D&D", edition: "5e", slug: "knowledge-unknown-edition", visibility: "private",
    }).returning("id").executeTakeFirstOrThrow();
    const tool = createKnowledgeTools(context(ownerId, unknownEdition.id))[0];
    await expect(tool.execute!({ query: "advantage" })).resolves.toMatchObject({
      filters: { systemId: "dnd", edition: null }, needsEdition: true, matches: [],
    });
    await expect(tool.execute!({ query: "advantage", edition: "5e-2024" })).resolves.toMatchObject({
      filters: { systemId: "dnd", edition: "5e-2024" }, needsEdition: false, matches: [],
    });
    await expect(tool.execute!({ query: "aspects", systemId: "fate" })).resolves.toMatchObject({
      filters: { systemId: "fate", edition: null }, needsEdition: true, matches: [],
    });
  });
});
