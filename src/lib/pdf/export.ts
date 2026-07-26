"use client";

import fontkit from "@pdf-lib/fontkit";
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from "pdf-lib";
import type { CharacterField, FieldValue } from "@/lib/types";

function applyValue(field: ReturnType<ReturnType<PDFDocument["getForm"]>["getField"]>, value: FieldValue) {
  if (field instanceof PDFTextField) field.setText(typeof value === "string" ? value : "");
  else if (field instanceof PDFCheckBox) {
    if (value === true) field.check();
    else field.uncheck();
  }
  else if (field instanceof PDFRadioGroup && typeof value === "string") field.select(value);
  else if (field instanceof PDFDropdown && typeof value === "string") field.select(value);
  else if (field instanceof PDFOptionList) {
    if (Array.isArray(value)) field.select(value);
    else if (typeof value === "string") field.select(value);
  }
}

export async function exportCharacterPdf({
  characterId,
  characterName,
  fields,
  flattened,
}: {
  characterId: string;
  characterName: string;
  fields: CharacterField[];
  flattened: boolean;
}) {
  const signedResponse = await fetch(`/api/characters/${characterId}/pdf`);
  if (!signedResponse.ok) throw new Error("Could not create a PDF download link");
  const { url } = (await signedResponse.json()) as { url: string };
  const [pdfBytes, fontBytes] = await Promise.all([
    fetch(url).then((response) => response.arrayBuffer()),
    fetch("/api/fonts/noto").then((response) => response.arrayBuffer()),
  ]);
  const pdfDocument = await PDFDocument.load(pdfBytes);
  pdfDocument.registerFontkit(fontkit);
  const unicodeFont = await pdfDocument.embedFont(fontBytes, { subset: true });
  const form = pdfDocument.getForm();
  for (const descriptor of fields) {
    try {
      applyValue(form.getField(descriptor.pdfName), descriptor.value);
    } catch {
      // Unknown fields are kept unchanged in the source PDF.
    }
  }
  form.updateFieldAppearances(unicodeFont);
  if (flattened) form.flatten({ updateFieldAppearances: false });
  const output = await pdfDocument.save();
  const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
  const href = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${characterName.replace(/[^\p{L}\p{N}_-]+/gu, "-") || "character"}${flattened ? "-print" : ""}.pdf`;
  anchor.click();
  URL.revokeObjectURL(href);
}
