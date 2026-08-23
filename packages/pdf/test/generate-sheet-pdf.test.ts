import { describe, expect, it } from "vitest";
import { generateA4SheetPdf } from "../src/generate-sheet-pdf.js";
import type { LayoutNode } from "@mycharacter/contracts";
import { defaultBoxProps } from "@mycharacter/contracts";
import { PDFDocument } from "pdf-lib";

describe("generateA4SheetPdf", () => {
  it("generates a valid A4 PDF document containing all 12 node types with Cyrillic text", async () => {
    const layout: LayoutNode = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      kind: "frame",
      direction: "vertical",
      gap: 12,
      align: "stretch",
      justify: "start",
      wrap: false,
      collapseAdjacentStrokes: false,
      ornamentStyle: "arc-corner",
      titleDock: { dock: "top", variant: "inline-start", text: "ГЕРОЙ ПОДЗЕМЕЛИЙ" },
      footerDock: { dock: "none", variant: "none" },
      box: {
        ...defaultBoxProps,
        padding: { top: 20, right: 20, bottom: 20, left: 20 },
      },
      children: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          kind: "text",
          text: "Имя персонажа: Эрис Ночной Ветер",
          variant: "title",
          align: "left",
          weight: "bold",
          fontFamily: "Montserrat Alternates",
          fontSize: 18,
          uppercase: false,
          color: "primary",
          box: defaultBoxProps,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440002",
          kind: "frame",
          direction: "horizontal",
          gap: 10,
          wrap: false,
          align: "center",
          justify: "start",
          collapseAdjacentStrokes: false,
          ornamentStyle: "none",
          titleDock: { dock: "none", variant: "none" },
          footerDock: { dock: "none", variant: "none" },
          box: defaultBoxProps,
          children: [
            {
              id: "550e8400-e29b-41d4-a716-446655440003",
              kind: "field-input",
              fieldBinding: "char_class",
              label: "Класс и Уровень",
              placeholder: "Воин 5",
              variant: "underline",
              readOnly: false,
              box: defaultBoxProps,
            },
            {
              id: "550e8400-e29b-41d4-a716-446655440004",
              kind: "number-input",
              fieldBinding: "strength",
              label: "Сила",
              placeholder: "16",
              variant: "circle",
              showSign: true,
              readOnly: false,
              box: defaultBoxProps,
            },
          ],
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440005",
          kind: "checkbox",
          fieldBinding: "inspiration",
          label: "Вдохновение",
          shape: "circle",
          readOnly: false,
          box: defaultBoxProps,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440006",
          kind: "select",
          fieldBinding: "alignment",
          label: "Мировоззрение",
          placeholder: "Выберите мировоззрение...",
          options: [
            { label: "Хаотичный добрый", value: "cg" },
            { label: "Законопослушный добрый", value: "lg" },
          ],
          readOnly: false,
          box: defaultBoxProps,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440007",
          kind: "divider",
          direction: "horizontal",
          strokeWidth: 1,
          strokeColor: "subtle",
          box: defaultBoxProps,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440008",
          kind: "spacer",
          size: 10,
          fill: false,
          box: defaultBoxProps,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440009",
          kind: "image",
          alt: "Портрет героя",
          url: "",
          fit: "cover",
          box: defaultBoxProps,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440010",
          kind: "textarea",
          fieldBinding: "bio",
          label: "Предыстория",
          rows: 2,
          placeholder: "Краткая биография...",
          variant: "boxed",
          readOnly: false,
          box: defaultBoxProps,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440011",
          kind: "component-instance",
          name: "Health Widget",
          componentId: "550e8400-e29b-41d4-a716-446655440099",
          componentVersionId: "550e8400-e29b-41d4-a716-446655440098",
          propertyOverrides: { current_hp: 45 },
          box: defaultBoxProps,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440012",
          kind: "repeater",
          name: "Заклинания и Способности",
          box: defaultBoxProps,
          config: {
            key: "spells",
            mode: "runtime",
            minRows: 0,
            maxRows: 10,
            initialRows: 0,
            allowAdd: true,
            allowRemove: true,
            allowReorder: true,
            printSplitPolicy: "auto",
            rowFieldSlots: [],
          },
          rowTemplate: {
            id: "550e8400-e29b-41d4-a716-446655440013",
            kind: "frame",
            direction: "horizontal",
            gap: 8,
            align: "center",
            justify: "start",
            wrap: false,
            collapseAdjacentStrokes: false,
            ornamentStyle: "none",
            titleDock: { dock: "none", variant: "none" },
            footerDock: { dock: "none", variant: "none" },
            box: defaultBoxProps,
            children: [
              {
                id: "550e8400-e29b-41d4-a716-446655440014",
                kind: "text",
                text: "Волшебная стрела",
                variant: "body",
                align: "left",
                weight: "normal",
                fontFamily: "Noto Sans",
                uppercase: false,
                color: "default",
                box: defaultBoxProps,
              },
            ],
          },
        },
      ],
    };

    const pdfBytes = await generateA4SheetPdf({
      layout,
      fieldValues: {
        char_class: "Боевой маг 3",
        strength: 18,
        inspiration: true,
        alignment: "Хаотичный добрый",
        bio: "Родился в древней башне магов...",
      },
      resolvedComponents: {
        "550e8400-e29b-41d4-a716-446655440098": {
          id: "550e8400-e29b-41d4-a716-446655440098",
          componentId: "550e8400-e29b-41d4-a716-446655440099",
          versionNumber: 1,
          schemaVersion: 1,
          layouts: {
            mobile: { id: "550e8400-e29b-41d4-a716-446655440101", kind: "text", text: "HP Component", variant: "body", align: "left", weight: "normal", fontFamily: "Noto Sans", uppercase: false, color: "default", box: defaultBoxProps },
            tablet: { id: "550e8400-e29b-41d4-a716-446655440102", kind: "text", text: "HP Component", variant: "body", align: "left", weight: "normal", fontFamily: "Noto Sans", uppercase: false, color: "default", box: defaultBoxProps },
            desktop: { id: "550e8400-e29b-41d4-a716-446655440103", kind: "text", text: "HP Component", variant: "body", align: "left", weight: "normal", fontFamily: "Noto Sans", uppercase: false, color: "default", box: defaultBoxProps },
            print: { id: "550e8400-e29b-41d4-a716-446655440104", kind: "text", text: "HP Component (Print)", variant: "body", align: "left", weight: "normal", fontFamily: "Noto Sans", uppercase: false, color: "default", box: defaultBoxProps },
          },
          exposedProperties: [],
          dependencies: [],
          changelog: "Initial",
          authorId: "author-1",
          createdAt: new Date().toISOString(),
        },
      },
      repeaterRows: {
        spells: [
          {
            id: "550e8400-e29b-41d4-a716-446655440201",
            characterId: "550e8400-e29b-41d4-a716-446655440200",
            repeaterKey: "spells",
            position: 0,
            version: 1,
            values: { name: "Огненный шар" },
            updatedAt: new Date().toISOString(),
            updatedBy: null,
          },
        ],
      },
      title: "Эрис — Лист персонажа",
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
    const firstPage = doc.getPage(0);
    const { width, height } = firstPage.getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(doc.getTitle()).toBe("Эрис — Лист персонажа");
  });

  it("handles multi-page pagination when repeater rows exceed single page height", async () => {
    const layout: LayoutNode = {
      id: "550e8400-e29b-41d4-a716-446655440300",
      kind: "repeater",
      name: "Длинный инвентарь",
      box: defaultBoxProps,
      config: {
        key: "inventory",
        mode: "runtime",
        minRows: 0,
        maxRows: 100,
        initialRows: 0,
        allowAdd: true,
        allowRemove: true,
        allowReorder: true,
        printSplitPolicy: "auto",
        rowFieldSlots: [],
      },
      rowTemplate: {
        id: "550e8400-e29b-41d4-a716-446655440301",
        kind: "frame",
        direction: "vertical",
        gap: 4,
        align: "stretch",
        justify: "start",
        wrap: false,
        collapseAdjacentStrokes: false,
        ornamentStyle: "none",
        titleDock: { dock: "none", variant: "none" },
        footerDock: { dock: "none", variant: "none" },
        box: { ...defaultBoxProps, height: { mode: "fixed", value: 40 } },
        children: [
          {
            id: "550e8400-e29b-41d4-a716-446655440302",
            kind: "text",
            text: "Тяжёлый кольчужный доспех древнего рыцаря (+2 к защите)",
            variant: "body",
            align: "left",
            weight: "normal",
            fontFamily: "Noto Sans",
            uppercase: false,
            color: "default",
            box: defaultBoxProps,
          },
        ],
      },
    };

    const rows = Array.from({ length: 35 }).map((_, i) => ({
      id: `550e8400-e29b-41d4-a716-4466554403${String(i).padStart(2, "0")}`,
      characterId: "550e8400-e29b-41d4-a716-446655440300",
      repeaterKey: "inventory",
      position: i,
      version: 1,
      values: {},
      updatedAt: new Date().toISOString(),
      updatedBy: null,
    }));

    const pdfBytes = await generateA4SheetPdf({
      layout,
      repeaterRows: { inventory: rows },
      title: "Инвентарь персонажа",
    });

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
