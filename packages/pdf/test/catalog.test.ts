import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  assignLabels,
  assignSpatialGroups,
  extractPdfCatalog,
  mapAnnotationKind,
  scoreLabelCandidate,
  type ExtractedCatalogField,
  type TextToken,
} from "../src/catalog.js";

function field(id: string, top: number): ExtractedCatalogField {
  return {
    id,
    pdfName: id,
    kind: "text",
    defaultValue: null,
    options: [],
    page: 1,
    label: id,
    aliases: [],
    section: "Заклинания",
    groupId: null,
    groupOrder: null,
    confidence: 0,
    source: "pdf",
    widgets: [
      {
        page: 1,
        rect: [0.3, top, 0.7, top + 0.04],
        pdfRect: [0, 0, 1, 1],
        rotation: 0,
        exportValue: null,
        widgetIndex: 0,
      },
    ],
  };
}

describe("PDF field catalog", () => {
  it("recognizes PDF.js multiline text annotations", () => {
    expect(mapAnnotationKind({ fieldType: "Tx", multiLine: true })).toBe(
      "multiline",
    );
    expect(mapAnnotationKind({ fieldType: "Tx", multiLine: false })).toBe(
      "text",
    );
  });

  it("prefers a close visible label over a distant number", () => {
    const rect: [number, number, number, number] = [0.35, 0.2, 0.7, 0.25];
    const label: TextToken = {
      text: "Сила",
      page: 1,
      rect: [0.25, 0.205, 0.34, 0.235],
      fontSize: 10,
      source: "pdf",
    };
    const number: TextToken = {
      text: "4",
      page: 1,
      rect: [0.34, 0.05, 0.36, 0.07],
      fontSize: 18,
      source: "pdf",
    };
    expect(scoreLabelCandidate(rect, label)).toBeGreaterThan(
      scoreLabelCandidate(rect, number),
    );
    expect(assignLabels([field("str_12", 0.2)], [label])[0].label).toBe("Сила");
  });

  it("groups consecutive fields in the same spatial column", () => {
    const grouped = assignSpatialGroups([
      field("spell_1", 0.2),
      field("spell_2", 0.26),
      field("spell_3", 0.32),
    ]);
    expect(grouped.every((item) => item.groupId === grouped[0].groupId)).toBe(
      true,
    );
    expect(grouped.map((item) => item.groupOrder)).toEqual([0, 1, 2]);
  });

  it("extracts an AcroForm field and its initial value", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([400, 500]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("Strength", { x: 40, y: 410, size: 12, font });
    const textField = pdf.getForm().createTextField("str_12");
    textField.setText("14");
    textField.addToPage(page, { x: 120, y: 400, width: 100, height: 24 });
    const result = await extractPdfCatalog(await pdf.save());
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]).toMatchObject({
      pdfName: "str_12",
      kind: "text",
      defaultValue: "14",
    });
    expect(
      result.fields[0].widgets[0].rect.every(
        (value) => value >= 0 && value <= 1,
      ),
    ).toBe(true);
  });
});
