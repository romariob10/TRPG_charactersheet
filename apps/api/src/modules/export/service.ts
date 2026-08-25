import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import type { Database } from "@mycharacter/database";
import { exportCharacterPdf, generateA4SheetPdf } from "@mycharacter/pdf";
import type {
  CharacterRepeaterRow,
  ComponentVersionDetails,
  LayoutNode,
} from "@mycharacter/contracts";
import { StorageError, type ObjectStorage } from "@mycharacter/storage";
import type { Kysely } from "kysely";
import { AppError } from "../../errors.js";
import { loadCharacterFields, loadCharacterSheetFieldValues } from "../characters/repository.js";
import { CharacterService } from "../characters/service.js";
import { RepeaterService } from "../repeaters/service.js";

export type ExportMode = "interactive" | "flattened";

export interface CharacterExport {
  bytes: Uint8Array;
  filename: string;
}

export class ExportService {
  private readonly db: Kysely<Database>;
  private readonly storage: ObjectStorage;
  private readonly characters: CharacterService;
  private readonly repeaters: RepeaterService;

  public constructor(database: Kysely<Database>, storage: ObjectStorage) {
    this.db = database;
    this.storage = storage;
    this.characters = new CharacterService(database);
    this.repeaters = new RepeaterService(database);
  }

  async exportCharacter(
    actorId: string,
    characterId: string,
    mode: ExportMode,
  ): Promise<CharacterExport> {
    const character = await this.characters.authorizeCharacter(
      actorId,
      characterId,
      "read",
    );

    if (character.sheetVersionId) {
      const versionRow = await this.db
        .selectFrom("sheet_versions")
        .where("id", "=", character.sheetVersionId)
        .selectAll()
        .executeTakeFirst();

      if (!versionRow) {
        throw new AppError("VERSION_NOT_FOUND", 404, "Sheet version not found.");
      }

      const layouts =
        typeof versionRow.layouts === "string"
          ? JSON.parse(versionRow.layouts)
          : versionRow.layouts;

      const printLayout: LayoutNode = layouts.print ?? layouts.desktop;
      if (!printLayout) {
        throw new AppError("LAYOUT_NOT_FOUND", 400, "No print layout found in sheet version.");
      }

      const fieldValues = await loadCharacterSheetFieldValues(this.db, character.id);

      // Load all repeater rows for this character
      const repeaterRowRecords = await this.db
        .selectFrom("character_repeater_rows")
        .where("character_id", "=", character.id)
        .select("repeater_key")
        .distinct()
        .execute();

      const repeaterRowsMap: Record<string, CharacterRepeaterRow[]> = {};
      for (const rec of repeaterRowRecords) {
        const rows = await this.repeaters.listRows(actorId, character.id, rec.repeater_key);
        repeaterRowsMap[rec.repeater_key] = rows;
      }

      // Check snapshot in dependencies
      let resolvedComponents: Record<string, ComponentVersionDetails> =
        typeof versionRow.dependencies === "string"
          ? JSON.parse(versionRow.dependencies)
          : (versionRow.dependencies ?? {});

      if (!resolvedComponents || Object.keys(resolvedComponents).length === 0) {
        resolvedComponents = {};
        const componentVersionIds = new Set<string>();
        const extractIds = (n: LayoutNode) => {
          if (!n || typeof n !== "object") return;
          if (n.kind === "component-instance" && n.componentVersionId) {
            componentVersionIds.add(n.componentVersionId);
          }
          if ("children" in n && Array.isArray(n.children)) {
            for (const c of n.children) extractIds(c);
          }
          if ("rowTemplate" in n && n.rowTemplate) extractIds(n.rowTemplate);
        };
        extractIds(printLayout);

        if (componentVersionIds.size > 0) {
          const vRows = await this.db
            .selectFrom("component_versions")
            .where("id", "in", Array.from(componentVersionIds))
            .selectAll()
            .execute();
          for (const v of vRows) {
            resolvedComponents[v.id] = {
              id: v.id,
              componentId: v.component_id,
              versionNumber: v.version_number,
              schemaVersion: v.schema_version,
              layouts: typeof v.layouts === "string" ? JSON.parse(v.layouts) : v.layouts,
              exposedProperties: typeof v.exposed_properties === "string" ? JSON.parse(v.exposed_properties) : (v.exposed_properties ?? []),
              dependencies: typeof v.dependencies === "string" ? JSON.parse(v.dependencies) : (v.dependencies ?? []),
              changelog: v.changelog,
              authorId: v.author_id,
              createdAt: v.created_at instanceof Date ? v.created_at.toISOString() : String(v.created_at),
            };
          }
        }
      }

      const bytes = await generateA4SheetPdf({
        layout: printLayout,
        fieldValues,
        repeaterRows: repeaterRowsMap,
        resolvedComponents,
        title: character.name,
      });

      return {
        bytes,
        filename: exportFilename(character.name, mode === "interactive"),
      };
    }

    if (!character.templateId) {
      throw pdfNotFound();
    }

    const file = await this.db
      .selectFrom("pdf_templates as template")
      .innerJoin("object_files as file", "file.id", "template.file_id")
      .select("file.storage_key as storageKey")
      .where("template.id", "=", character.templateId)
      .where("template.deleted_at", "is", null)
      .executeTakeFirst();

    if (!file) throw pdfNotFound();

    let stream;
    try {
      ({ stream } = await this.storage.open(file.storageKey));
    } catch (error) {
      if (error instanceof StorageError && error.code === "STORAGE_NOT_FOUND") {
        throw pdfNotFound();
      }
      throw error;
    }

    const templateBytes = await streamToBuffer(stream);
    const fields = await loadCharacterFields(this.db, character.id, character.templateId);
    const fontBytes = await loadFont(
      "@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff",
    );

    const exportedBytes = await exportCharacterPdf({
      source: templateBytes,
      fields,
      flattened: mode === "flattened",
      fontBytes,
    });

    return {
      bytes: exportedBytes,
      filename: exportFilename(character.name, mode === "interactive"),
    };
  }
}

async function streamToBuffer(
  stream: NodeJS.ReadableStream & AsyncIterable<Buffer | string>,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function exportFilename(name: string, interactive: boolean): string {
  const trimmed = name.trim() || "character";
  return interactive ? `${trimmed}.pdf` : `${trimmed}-print.pdf`;
}

function pdfNotFound(): AppError {
  return new AppError("PDF_NOT_FOUND", 404, "PDF template not found.");
}

async function loadFont(specifier: string): Promise<Uint8Array> {
  const require = createRequire(import.meta.url);
  const path = require.resolve(specifier);
  return new Uint8Array(await readFile(path));
}
