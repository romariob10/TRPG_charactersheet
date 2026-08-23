import {
  createTestDatabase,
  destroyTestDatabase,
  type Database,
} from "@mycharacter/database";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultBoxProps } from "@mycharacter/contracts";
import { AuthService } from "../src/modules/auth/service.js";
import { GameSystemsService } from "../src/modules/systems/service.js";
import { SheetBuilderService } from "../src/modules/sheet-builder/service.js";
import { ComponentLibraryService } from "../src/modules/components/service.js";
import { RepeaterService } from "../src/modules/repeaters/service.js";

const password = "correct horse battery staple";

describe("Sheet Builder & Component Library Services", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>> | null = null;
  let db: Kysely<Database>;
  let user1Id: string;
  let user2Id: string;
  let systemsService: GameSystemsService;
  let sheetBuilderService: SheetBuilderService;
  let componentService: ComponentLibraryService;
  let repeaterService: RepeaterService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      return;
    }
    testDb = await createTestDatabase();
    db = testDb.db as unknown as Kysely<Database>;
    systemsService = new GameSystemsService(db);
    sheetBuilderService = new SheetBuilderService(db);
    componentService = new ComponentLibraryService(db);
    repeaterService = new RepeaterService(db);

    const auth = new AuthService(db);
    user1Id = (await auth.register("sb-user1@example.com", password)).id;
    user2Id = (await auth.register("sb-user2@example.com", password)).id;
  });

  afterAll(async () => {
    if (testDb) {
      await destroyTestDatabase(testDb);
    }
  });

  it("creates and manages game systems with permissions", async () => {
    if (!testDb) return;

    const system = await systemsService.create(user1Id, {
      title: "XolonoFade Core",
      description: "A dark sci-fi RPG",
      family: "XolonoFade",
      edition: "1st",
      visibility: "private",
    });

    expect(system.title).toBe("XolonoFade Core");
    expect(system.defaultSheetId).toBeDefined();

    // Stranger cannot edit
    await expect(
      systemsService.update(user2Id, system.id, { title: "Hacked" }),
    ).rejects.toThrow(/FORBIDDEN|owner/i);

    // Stranger cannot read private system
    await expect(systemsService.get(user2Id, system.id)).rejects.toThrow(
      /restricted|forbidden|owner/i,
    );

    // Make public and verify stranger can read
    await systemsService.update(user1Id, system.id, { visibility: "public" });
    const publicSystem = await systemsService.get(user2Id, system.id);
    expect(publicSystem.title).toBe("XolonoFade Core");
    expect(publicSystem.isOwner).toBe(false);
  });

  it("handles sheet definitions, drafts, revision conflicts and publication", async () => {
    if (!testDb) return;

    const system = await systemsService.create(user1Id, {
      title: "D&D 5e Custom",
      description: "Fantasy",
      visibility: "public",
    });

    const sheetDef = await sheetBuilderService.createSheetDefinition(user1Id, {
      systemId: system.id,
      title: "Hero Sheet",
      kind: "character",
      description: "Main sheet",
    });

    const editorData = await sheetBuilderService.getSheetEditorData(
      user1Id,
      sheetDef.id,
    );
    expect(editorData.draft.revision).toBe(1);
    expect(editorData.versions).toHaveLength(0);

    // Autosave draft
    const rootNode = {
      id: crypto.randomUUID(),
      kind: "frame" as const,
      direction: "vertical" as const,
      gap: 8,
      align: "stretch" as const,
      justify: "start" as const,
      wrap: false,
      collapseAdjacentStrokes: false,
      ornamentStyle: "none" as const,
      titleDock: { dock: "none" as const, variant: "none" as const },
      footerDock: { dock: "none" as const, variant: "none" as const },
      box: defaultBoxProps,
      children: [],
    };

    const newLayouts = {
      mobile: rootNode,
      tablet: rootNode,
      desktop: rootNode,
      print: rootNode,
    };

    const autosaveRes = await sheetBuilderService.autosaveSheetDraft(
      user1Id,
      sheetDef.id,
      {
        expectedRevision: 1,
        layouts: newLayouts,
        fields: [],
      },
    );

    expect(autosaveRes.revision).toBe(2);
    expect(autosaveRes.valid).toBe(true);

    const normalizedEditorData = await sheetBuilderService.getSheetEditorData(
      user1Id,
      sheetDef.id,
    );
    const normalizedPrint = normalizedEditorData.draft.layouts.print;
    expect(normalizedPrint.kind).toBe("frame");
    if (normalizedPrint.kind === "frame") {
      expect(normalizedPrint.cornerOrnaments?.preset).toBe("none");
      expect(normalizedPrint).not.toHaveProperty("ornamentStyle");
      expect(normalizedPrint).not.toHaveProperty("titleDock");
      expect(normalizedPrint).not.toHaveProperty("footerDock");
    }

    // Stale revision conflict
    await expect(
      sheetBuilderService.autosaveSheetDraft(user1Id, sheetDef.id, {
        expectedRevision: 1, // Stale!
        layouts: newLayouts,
        fields: [],
      }),
    ).rejects.toThrow(/REVISION_CONFLICT|modified/i);

    // Publish version
    const pubRes = await sheetBuilderService.publishSheetVersion(
      user1Id,
      sheetDef.id,
      {
        changelog: "Initial release",
      },
    );

    expect(pubRes.versionNumber).toBe(1);
    const versions = await sheetBuilderService.listSheetVersions(sheetDef.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].versionNumber).toBe(1);
    const publishedVersion = await sheetBuilderService.getSheetVersion(
      pubRes.versionId,
    );
    expect(publishedVersion.layouts.print).not.toHaveProperty("ornamentStyle");
  });

  it("handles component library, drafts, versioning, cycles and forks", async () => {
    if (!testDb) return;

    const comp = await componentService.createComponent(user1Id, {
      name: "Saving Throws Block",
      description: "6 standard saves",
      scope: "public",
      tags: ["stats", "dnd"],
    });

    expect(comp.name).toBe("Saving Throws Block");

    // Publish component version
    const pubRes = await componentService.publishComponentVersion(
      user1Id,
      comp.id,
      {
        changelog: "v1.0",
      },
    );

    expect(pubRes.versionNumber).toBe(1);

    // User2 forks public component
    const forked = await componentService.forkComponent(user2Id, comp.id, {
      name: "My Custom Saves",
      scope: "personal",
    });

    expect(forked.name).toBe("My Custom Saves");
    expect(forked.isOwner).toBe(true);
  });

  it("handles repeater rows, updates, reorder and mutations", async () => {
    if (!testDb) return;

    // Create a test character
    let template = await db
      .selectFrom("pdf_templates")
      .select("id")
      .executeTakeFirst();

    if (!template) {
      const fileId = crypto.randomUUID();
      await db
        .insertInto("object_files")
        .values({
          id: fileId,
          storage_key: "test/path.pdf",
          media_type: "application/pdf",
          size_bytes: "1024",
          sha256:
            "0000000000000000000000000000000000000000000000000000000000000000",
          state: "ready",
        })
        .execute();

      template = await db
        .insertInto("pdf_templates")
        .values({
          owner_id: user1Id,
          file_id: fileId,
          title: "Test Template",
          slug: "test-template-" + crypto.randomUUID().slice(0, 8),
          storage_path: "test/path.pdf",
          sha256:
            "0000000000000000000000000000000000000000000000000000000000000000",
          page_count: 1,
          catalog_status: "ready",
          allow_vision: false,
          is_public: true,
          visibility: "private",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
    }

    const templateId = template.id;

    const character = await db
      .insertInto("characters")
      .values({
        owner_id: user1Id,
        template_id: templateId,
        name: "Test Hero",
        status: "active",
        revision: "0",
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const clientMutationId1 = crypto.randomUUID();
    const row1 = await repeaterService.addRow(user1Id, character.id, {
      repeaterKey: "inventory",
      clientMutationId: clientMutationId1,
      initialValues: { item_name: "Longsword", qty: 1 },
    });

    expect(row1.position).toBe(0);
    expect(row1.values.item_name).toBe("Longsword");

    // Idempotent retry returns the same row
    const retryRow1 = await repeaterService.addRow(user1Id, character.id, {
      repeaterKey: "inventory",
      clientMutationId: clientMutationId1,
      initialValues: { item_name: "Longsword", qty: 1 },
    });
    expect(retryRow1.id).toBe(row1.id);

    // Add second row
    const row2 = await repeaterService.addRow(user1Id, character.id, {
      repeaterKey: "inventory",
      clientMutationId: crypto.randomUUID(),
      initialValues: { item_name: "Shield", qty: 1 },
    });
    expect(row2.position).toBe(1);

    // Update field in row1
    const updatedRow1 = await repeaterService.updateRowField(
      user1Id,
      character.id,
      row1.id,
      "qty",
      {
        value: 2,
        expectedVersion: row1.version,
        clientMutationId: crypto.randomUUID(),
      },
    );
    expect(updatedRow1.values.qty).toBe(2);

    // Reorder rows
    await repeaterService.reorderRows(user1Id, character.id, {
      repeaterKey: "inventory",
      rowIds: [row2.id, row1.id],
      clientMutationId: crypto.randomUUID(),
    });

    const rows = await repeaterService.listRows(
      user1Id,
      character.id,
      "inventory",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(row2.id);
    expect(rows[1].id).toBe(row1.id);

    // Remove row
    await repeaterService.removeRow(
      user1Id,
      character.id,
      row2.id,
      crypto.randomUUID(),
    );
    const rowsAfterDelete = await repeaterService.listRows(
      user1Id,
      character.id,
      "inventory",
    );
    expect(rowsAfterDelete).toHaveLength(1);
    expect(rowsAfterDelete[0].id).toBe(row1.id);
  });
});
