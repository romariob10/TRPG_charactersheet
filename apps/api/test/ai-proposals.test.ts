import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import type { Message } from "@ag-ui/client";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiProposalService } from "../src/modules/ai/proposal-service.js";
import { PostgresAiRepository } from "../src/modules/ai/repository.js";
import { createCharacterTools } from "../src/modules/ai/tools.js";
import { LocalRealtimeBus } from "../src/realtime/local-realtime-bus.js";

describe("AI proposal transactions", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let service: AiProposalService;
  let ownerId: string;
  let strangerId: string;
  let characterId: string;
  let fieldA: string;
  let fieldB: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    service = new AiProposalService(
      testDb.db as unknown as Kysely<Database>,
      new LocalRealtimeBus(),
    );
  });

  beforeEach(async () => {
    for (const table of [
      "ai_proposal_items",
      "ai_proposals",
      "character_values",
      "characters",
      "pdf_fields",
      "pdf_templates",
      "object_files",
      "profiles",
      "users",
    ] as const) {
      await testDb.db.deleteFrom(table).execute();
    }
    ownerId = await createUser("ai-owner@example.com");
    strangerId = await createUser("ai-stranger@example.com");
    const file = await testDb.db
      .insertInto("object_files")
      .values({
        storage_key: `tests/${crypto.randomUUID()}.pdf`,
        sha256: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
        size_bytes: "100",
        media_type: "application/pdf",
        state: "ready",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const template = await testDb.db
      .insertInto("pdf_templates")
      .values({
        file_id: file.id,
        owner_id: ownerId,
        visibility: "private",
        title: "AI test",
        slug: "ai-test",
        storage_path: `legacy/${crypto.randomUUID()}.pdf`,
        sha256: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
        page_count: 1,
        catalog_status: "ready",
        catalog_approved_at: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const fields = await testDb.db
      .insertInto("pdf_fields")
      .values([
        {
          template_id: template.id,
          pdf_name: "name",
          kind: "text",
          options: JSON.stringify([]),
          page: 1,
        },
        {
          template_id: template.id,
          pdf_name: "class",
          kind: "text",
          options: JSON.stringify([]),
          page: 1,
        },
      ])
      .returning("id")
      .execute();
    [fieldA, fieldB] = fields.map((field) => field.id);
    characterId = (
      await testDb.db
        .insertInto("characters")
        .values({
          template_id: template.id,
          owner_id: ownerId,
          name: "Ada",
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
  });

  afterAll(async () => {
    await destroyTestDatabase(testDb);
  });

  it("applies independent items and keeps stale conflicts pending", async () => {
    const proposal = await createProposal([
      { fieldId: fieldA, value: "Ada", expectedVersion: 0 },
      { fieldId: fieldB, value: "Wizard", expectedVersion: 0 },
    ]);
    await testDb.db
      .insertInto("character_values")
      .values({
        character_id: characterId,
        field_id: fieldA,
        value: JSON.stringify("Borin"),
        version: 1,
        updated_by: ownerId,
      })
      .execute();

    const result = await service.apply(
      ownerId,
      characterId,
      proposal.id,
      proposal.items,
    );

    expect(result.applied).toEqual([
      expect.objectContaining({ fieldId: fieldB, value: "Wizard", version: 1 }),
    ]);
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        fieldId: fieldA,
        reason: "version_conflict",
        currentVersion: 1,
      }),
    ]);
    await expect(service.getStatus(ownerId, proposal.id)).resolves.toEqual({
      status: "pending",
    });
  });

  it("serializes concurrent attempts so a proposal applies once", async () => {
    const proposal = await createProposal([
      { fieldId: fieldA, value: "Ada", expectedVersion: 0 },
    ]);

    const attempts = await Promise.allSettled([
      service.apply(ownerId, characterId, proposal.id, proposal.items),
      service.apply(ownerId, characterId, proposal.id, proposal.items),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find(
      (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected",
    );
    expect(rejected?.reason).toMatchObject({
      code: "AI_PROPOSAL_NOT_PENDING",
      statusCode: 409,
    });
    const stored = await testDb.db
      .selectFrom("character_values")
      .select(["value", "version"])
      .where("character_id", "=", characterId)
      .where("field_id", "=", fieldA)
      .executeTakeFirstOrThrow();
    expect(stored).toMatchObject({ value: "Ada", version: 1 });
  });

  it("keeps proposals private to their creator", async () => {
    const proposal = await createProposal([
      { fieldId: fieldA, value: "Ada", expectedVersion: 0 },
    ]);
    await expect(service.getStatus(strangerId, proposal.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
    await expect(
      service.apply(strangerId, characterId, proposal.id, proposal.items),
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
  });

  it("scopes chat history to one user and character", async () => {
    const database = testDb.db as unknown as Kysely<Database>;
    const ownerRepository = new PostgresAiRepository(
      database,
      characterId,
      ownerId,
    );
    const strangerRepository = new PostgresAiRepository(
      database,
      characterId,
      strangerId,
    );
    const message = {
      id: "private-message",
      role: "user",
      content: "Secret character notes",
    } as Message;

    await ownerRepository.persistMessages("private-thread", [message]);

    await expect(ownerRepository.loadMessages("private-thread")).resolves.toEqual([
      message,
    ]);
    await expect(strangerRepository.loadMessages("private-thread")).resolves.toEqual(
      [],
    );
    await expect(strangerRepository.listThreads()).resolves.toEqual([]);
  });

  it("exposes exactly the three safe character tools", () => {
    const tools = createCharacterTools({
      database: testDb.db as unknown as Kysely<Database>,
      characterId,
      templateId: "unused-until-execution",
      userId: ownerId,
    });
    expect(tools.map((tool) => tool.name)).toEqual([
      "searchFields",
      "getFieldContext",
      "proposeFieldChanges",
    ]);
  });

  async function createUser(email: string): Promise<string> {
    return (
      await testDb.db
        .insertInto("users")
        .values({ email, password_hash: "unused" })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
  }

  async function createProposal(
    changes: Array<{ fieldId: string; value: string; expectedVersion: number }>,
  ) {
    const proposal = await testDb.db
      .insertInto("ai_proposals")
      .values({ character_id: characterId, user_id: ownerId })
      .returning("id")
      .executeTakeFirstOrThrow();
    const items = changes.map((change) => ({
      itemId: crypto.randomUUID(),
      value: change.value,
      ...change,
    }));
    await testDb.db
      .insertInto("ai_proposal_items")
      .values(
        items.map((item) => ({
          id: item.itemId,
          proposal_id: proposal.id,
          field_id: item.fieldId,
          old_value: JSON.stringify(null),
          new_value: JSON.stringify(item.value),
          expected_version: item.expectedVersion,
          reason: "test",
          confidence: 1,
        })),
      )
      .execute();
    return { id: proposal.id, items };
  }
});
