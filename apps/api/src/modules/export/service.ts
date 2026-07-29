import type { Database } from "@mycharacter/database";
import { exportCharacterPdf } from "@mycharacter/pdf";
import { StorageError, type ObjectStorage } from "@mycharacter/storage";
import type { Kysely } from "kysely";
import { AppError } from "../../errors.js";
import { loadCharacterFields } from "../characters/repository.js";
import { CharacterService } from "../characters/service.js";

export type ExportMode = "interactive" | "flattened";

export interface CharacterExport {
  bytes: Uint8Array;
  filename: string;
}

export class ExportService {
  private readonly db: Kysely<Database>;
  private readonly storage: ObjectStorage;
  private readonly characters: CharacterService;

  public constructor(database: Kysely<Database>, storage: ObjectStorage) {
    this.db = database;
    this.storage = storage;
    this.characters = new CharacterService(database);
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
    const file = await this.db
      .selectFrom("pdf_templates as template")
      .innerJoin("object_files as file", "file.id", "template.file_id")
      .select("file.storage_key as storageKey")
      .where("template.id", "=", character.templateId)
      .where("file.state", "=", "ready")
      .executeTakeFirst();
    if (!file) throw pdfNotFound();

    let source: Uint8Array;
    try {
      const opened = await this.storage.open(file.storageKey);
      source = await readAll(opened.stream);
    } catch (error) {
      if (
        error instanceof StorageError &&
        error.code === "STORAGE_NOT_FOUND"
      ) {
        throw pdfNotFound();
      }
      throw error;
    }
    const fields = await loadCharacterFields(
      this.db,
      character.id,
      character.templateId,
    );
    const bytes = await exportCharacterPdf({
      source,
      fields,
      flattened: mode === "flattened",
      fontBytes: await loadNotoSans(),
    });
    return {
      bytes,
      filename: exportFilename(
        character.name,
        mode === "flattened",
      ),
    };
  }
}

async function loadNotoSans(): Promise<Uint8Array> {
  const require = createRequire(import.meta.url);
  return readFile(
    require.resolve(
      "@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff",
    ),
  );
}

async function readAll(
  stream: NodeJS.ReadableStream & AsyncIterable<Buffer | string>,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function exportFilename(name: string, flattened: boolean): string {
  const safe = name
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return `${safe || "character"}${flattened ? "-print" : ""}.pdf`;
}

function pdfNotFound(): AppError {
  return new AppError("PDF_NOT_FOUND", 404, "PDF not found.");
}
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
