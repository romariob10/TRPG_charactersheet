import fontkit from "@pdf-lib/fontkit";
import type { CharacterField, FieldValue } from "@mycharacter/contracts";
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from "pdf-lib";

export interface ExportCharacterPdfOptions {
  source: Uint8Array;
  fields: CharacterField[];
  flattened: boolean;
  fontBytes: Uint8Array;
}

export async function exportCharacterPdf(
  options: ExportCharacterPdfOptions,
): Promise<Uint8Array> {
  const document = await PDFDocument.load(options.source);
  document.registerFontkit(fontkit);
  const unicodeFont = await document.embedFont(options.fontBytes, {
    subset: true,
  });
  const form = document.getForm();
  for (const descriptor of options.fields) {
    try {
      applyValue(form.getField(descriptor.pdfName), descriptor.value);
    } catch {
      // Unsupported or missing source fields remain unchanged.
    }
  }
  form.updateFieldAppearances(unicodeFont);
  if (options.flattened) {
    form.flatten({ updateFieldAppearances: false });
  }
  return document.save();
}

function applyValue(
  field: ReturnType<ReturnType<PDFDocument["getForm"]>["getField"]>,
  value: FieldValue,
): void {
  if (field instanceof PDFTextField) {
    field.setText(typeof value === "string" ? value : "");
  } else if (field instanceof PDFCheckBox) {
    if (value === true) field.check();
    else field.uncheck();
  } else if (field instanceof PDFRadioGroup && typeof value === "string") {
    field.select(value);
  } else if (field instanceof PDFDropdown && typeof value === "string") {
    field.select(value);
  } else if (field instanceof PDFOptionList) {
    if (Array.isArray(value)) field.select(value);
    else if (typeof value === "string") field.select(value);
  }
}
