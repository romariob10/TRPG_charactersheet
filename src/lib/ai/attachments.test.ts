import { describe, expect, it } from "vitest";
import type { Message } from "@ag-ui/client";
import {
  normalizeMessageAttachments,
  prepareMessageAttachments,
  restoreMessageAttachmentsForDisplay,
} from "@/lib/ai/attachments";

describe("AI chat attachments", () => {
  it("converts an inline text file into untrusted model context", async () => {
    const message = {
      id: "message-1",
      role: "user",
      content: [
        { type: "text", text: "Summarize this file" },
        {
          type: "document",
          source: {
            type: "data",
            value: Buffer.from("Armor Class: 18").toString("base64"),
            mimeType: "text/plain",
          },
          metadata: { filename: "notes.txt" },
        },
      ],
    } as Message;

    const normalized = await normalizeMessageAttachments(message);
    expect(normalized.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Armor Class: 18"),
        }),
      ]),
    );
    expect(JSON.stringify(normalized.content)).not.toContain(
      Buffer.from("Armor Class: 18").toString("base64"),
    );
  });

  it("converts an AI SDK file part before it reaches a text-only provider", async () => {
    const encoded = Buffer.from("Character level: 7").toString("base64");
    const message = {
      id: "message-2",
      role: "user",
      content: [
        {
          type: "file",
          data: encoded,
          mediaType: "text/plain",
          filename: "character.txt",
        },
      ],
    } as unknown as Message;

    const normalized = await normalizeMessageAttachments(message);
    expect(normalized.content).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("Character level: 7"),
      }),
    ]);
    expect(JSON.stringify(normalized.content)).not.toContain(encoded);
    expect(JSON.stringify(normalized.content)).not.toContain('"type":"file"');
  });

  it("persists a document card without exposing extracted text in the UI", async () => {
    const encoded = Buffer.from("Hidden PDF context").toString("base64");
    const message = {
      id: "message-3",
      role: "user",
      content: [
        { type: "text", text: "Use this sheet" },
        {
          type: "document",
          source: { type: "data", value: encoded, mimeType: "text/plain" },
          metadata: { filename: "sheet.txt" },
        },
      ],
    } as Message;

    const prepared = await prepareMessageAttachments(message);
    expect(JSON.stringify(prepared.providerMessage.content)).toContain(
      "Hidden PDF context",
    );
    expect(JSON.stringify(prepared.displayMessage.content)).toContain(
      '"type":"document"',
    );
    expect(JSON.stringify(prepared.displayMessage.content)).toContain(
      '"filename":"sheet.txt"',
    );
    expect(JSON.stringify(prepared.displayMessage.content)).not.toContain(
      encoded,
    );
  });

  it("repairs legacy attachment tags into document cards", () => {
    const message = {
      id: "legacy",
      role: "user",
      content: [
        {
          type: "text",
          text: 'Check this <attachment name="old.pdf" mime="application/pdf">legacy extracted text</attachment>',
        },
      ],
    } as Message;

    const restored = restoreMessageAttachmentsForDisplay(message);
    expect(restored.content).toEqual([
      { type: "text", text: "Check this" },
      expect.objectContaining({
        type: "document",
        metadata: expect.objectContaining({ filename: "old.pdf" }),
      }),
    ]);
    const visibleText = Array.isArray(restored.content)
      ? restored.content
          .filter(
            (part): part is { type: "text"; text: string } =>
              part.type === "text",
          )
          .map((part) => part.text)
          .join("\n")
      : String(restored.content);
    expect(visibleText).not.toContain("<attachment");
  });
});
