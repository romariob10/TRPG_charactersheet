import { describe, expect, it } from "vitest";
import { generateA4SheetPdf } from "../src/generate-sheet-pdf.js";
import type { LayoutNode } from "@mycharacter/contracts";
import { defaultBoxProps, layoutNodeSchema, componentVersionDetailsSchema } from "@mycharacter/contracts";
import { PDFDocument } from "pdf-lib";
import { extractPdfCatalog } from "../src/catalog.js";

describe("generateA4SheetPdf", () => {
  it("exports native page frames to separate A4 pages without losing sibling content", async () => {
    const root = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "frame", box: { ...defaultBoxProps, height: { mode: "fixed", value: 2526 } }, children: [
      { id: crypto.randomUUID(), kind: "text", text: "Обложка", box: defaultBoxProps },
      ...["Характеристики", "Биография", "Заклинания"].map(text => ({ id: crypto.randomUUID(), kind: "frame", printAsPage: true,
        box: { ...defaultBoxProps, height: { mode: "fixed", value: 842 } },
        children: [{ id: crypto.randomUUID(), kind: "text", text, box: defaultBoxProps }] })),
    ] });
    const bytes = await generateA4SheetPdf({ layout: root });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(4);
    for (const page of pdf.getPages()) { expect(page.getWidth()).toBeCloseTo(595.28); expect(page.getHeight()).toBeCloseTo(841.89); }
    const catalog = await extractPdfCatalog(bytes);
    expect(catalog.tokens.map(token => token.text).join(" ")).toContain("Обложка");
    expect(catalog.tokens.map(token => token.text).join(" ")).toContain("Заклинания");
  });
  it("fits numeric fonts to their slots and preserves centered cross-axis alignment", async () => {
    const numeric = (key: string, height: LayoutNode["box"]["height"]) => layoutNodeSchema.parse({
      id: crypto.randomUUID(), kind: "number-input", fieldBinding: key, variant: "plain",
      box: { ...defaultBoxProps, height },
    });
    const row = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "frame", direction: "horizontal", align: "center", gap: 0,
      box: { ...defaultBoxProps, height: { mode: "fixed", value: 60 } },
      children: [numeric("small", { mode: "fixed", value: 24 }), numeric("large", { mode: "fill" })] });
    const layout = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "frame",
      box: { ...defaultBoxProps, height: { mode: "fixed", value: 842 } }, children: [row] });
    const catalog = await extractPdfCatalog(await generateA4SheetPdf({ layout, fieldValues: { small: 12, large: 34 } }));
    const small = catalog.tokens.find(token => token.text === "12")!;
    const large = catalog.tokens.find(token => token.text === "34")!;
    expect(small.fontSize).toBeCloseTo(14, 1);
    expect(large.fontSize).toBeCloseTo(32, 1);
    const centerY = (token: typeof small) => (token.rect[1] + token.rect[3]) / 2 * 842;
    expect(Math.abs(centerY(small) - centerY(large))).toBeLessThan(4);
  });

  it("centers signed single-line values without a second input border", async () => {
    const field = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "field-input", fieldBinding: "modifier", align: "center", variant: "plain",
      box: { ...defaultBoxProps, height: { mode: "fixed", value: 24 } } });
    const root = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "frame", box: { ...defaultBoxProps, height: { mode: "fixed", value: 842 } }, children: [field] });
    const catalog = await extractPdfCatalog(await generateA4SheetPdf({ layout: root, fieldValues: { modifier: "+2" } }));
    const value = catalog.tokens.find(token => token.text === "+2")!;
    expect((value.rect[0] + value.rect[2]) / 2).toBeCloseTo(0.5, 3);
  });

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
          fieldBinding: "portrait",
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

  it("shares fixed print height between Fill fields without moving content below long text", async () => {
    const frame = (children: LayoutNode[], height: number): LayoutNode => ({
      id: crypto.randomUUID(), kind: "frame", children, direction: "vertical", gap: 0,
      align: "stretch", justify: "start", wrap: false, collapseAdjacentStrokes: false,
      ornamentStyle: "none", titleDock: { dock: "none", variant: "none" }, footerDock: { dock: "none", variant: "none" },
      box: { ...defaultBoxProps, height: { mode: "fixed", value: height } },
    });
    const textarea = (key: string): LayoutNode => ({
      id: crypto.randomUUID(), kind: "textarea", fieldBinding: key, label: "", placeholder: "", rows: 1,
      variant: "plain", readOnly: false, box: { ...defaultBoxProps, height: { mode: "fill" } },
    });
    const layout = frame([frame([textarea("first"), textarea("second")], 120), {
      id: crypto.randomUUID(), kind: "text", text: "AFTER", variant: "body", align: "left", weight: "normal",
      fontFamily: "Noto Sans", uppercase: false, color: "ink", box: defaultBoxProps,
    }], 842);
    const normal = await extractPdfCatalog(await generateA4SheetPdf({ layout, fieldValues: { first: "FIRST", second: "SECOND" } }));
    const first = normal.tokens.find(token => token.text === "FIRST")!;
    const second = normal.tokens.find(token => token.text === "SECOND")!;
    expect(second.rect[1] - first.rect[1]).toBeCloseTo(60 / 842, 3);
    const long = await extractPdfCatalog(await generateA4SheetPdf({ layout, fieldValues: { first: "Overflow line ".repeat(300), second: "SECOND" } }));
    expect(long.pageCount).toBe(1);
    expect(long.tokens.find(token => token.text === "AFTER")?.rect).toEqual(normal.tokens.find(token => token.text === "AFTER")?.rect);
    expect(long.tokens.filter(token => token.text.includes("Overflow")).every(token => token.rect[3] < second.rect[1])).toBe(true);
  });

  it("renders component exposed properties and screen-size field text in PDF", async () => {
    const leaf = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "text", text: "ORIGINAL", box: defaultBoxProps });
    const root = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "frame", children: [leaf], box: defaultBoxProps });
    const version = componentVersionDetailsSchema.parse({ id: crypto.randomUUID(), componentId: crypto.randomUUID(), versionNumber: 1, schemaVersion: 1, layouts: { desktop: root, print: root, tablet: root, mobile: root }, exposedProperties: [{ propertyId: "title", type: "text", name: "Title", targetNodeId: leaf.id, targetPropPath: "text" }], dependencies: [], changelog: "", authorId: crypto.randomUUID(), createdAt: "now" });
    const instance = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "component-instance", componentId: version.componentId, componentVersionId: version.id, propertyOverrides: { title: "OVERRIDDEN" }, box: defaultBoxProps });
    const field = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "field-input", fieldBinding: "name", variant: "plain", box: { ...defaultBoxProps, height: { mode: "fixed", value: 24 } } });
    const layout = layoutNodeSchema.parse({ ...root, box: { ...defaultBoxProps, height: { mode: "fixed", value: 842 } }, children: [instance, field] });
    const catalog = await extractPdfCatalog(await generateA4SheetPdf({ layout, resolvedComponents: { [version.id]: version }, fieldValues: { name: "CHARACTER" } }));
    expect(catalog.tokens.some((token) => token.text === "OVERRIDDEN")).toBe(true);
    expect(catalog.tokens.some((token) => token.text === "ORIGINAL")).toBe(false);
    expect(catalog.tokens.find((token) => token.text === "CHARACTER")?.fontSize).toBeCloseTo(14, 2);
    const compact = await extractPdfCatalog(await generateA4SheetPdf({ layout, fieldValues: { name: "CHARACTER", __layout_main_font_size__: 10 } }));
    expect(compact.tokens.find((token) => token.text === "CHARACTER")?.fontSize).toBeCloseTo(14, 2);
  });

  it("renders multiline list items, markers, legacy values and compact leading", async () => {
    for (const listStyle of ["lined", "numbered", "bulleted"] as const) {
      const list = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "textarea", fieldBinding: "items", listStyle, itemCount: 2,
        itemBindings: ["old_a", "old_b"], box: { ...defaultBoxProps, height: { mode: "fixed", value: 120 } } });
      const ordinary = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "textarea", fieldBinding: "plain", box: defaultBoxProps });
      const layout = layoutNodeSchema.parse({ id: crypto.randomUUID(), kind: "frame", direction: "vertical", children: [list, ordinary], box: { ...defaultBoxProps, height: { mode: "fixed", value: 842 } } });
      const catalog = await extractPdfCatalog(await generateA4SheetPdf({ layout, fieldValues: {
        old_a: "ALPHA\nCONTINUED", old_b: "BETA", plain: ["LINE_A", "LINE_B"], __layout_main_font_size__: 10,
      } }));
      expect(catalog.pageCount).toBe(1);
      for (const text of ["ALPHA", "CONTINUED", "BETA"]) {
        const token = catalog.tokens.find(token => token.text.includes(text));
        expect(token?.fontSize).toBeCloseTo(10, 2);
      }
      if (listStyle === "numbered") expect(catalog.tokens.some(token => token.text.includes("2."))).toBe(true);
      if (listStyle === "bulleted") expect(catalog.tokens.some(token => token.text.includes("•"))).toBe(true);
      const first = catalog.tokens.find(token => token.text === "LINE_A")!;
      const second = catalog.tokens.find(token => token.text === "LINE_B")!;
      expect((second.rect[1] - first.rect[1]) * 842).toBeCloseTo(12.5, 1);
    }
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

  it("renders Fate turnbacks and Fate/D&D title ornaments in PDF", async () => {
    const layout: LayoutNode = {
      id: "550e8400-e29b-41d4-a716-446655440400",
      kind: "frame",
      direction: "vertical",
      gap: 16,
      align: "stretch",
      justify: "start",
      wrap: false,
      collapseAdjacentStrokes: false,
      cornerOrnaments: {
        preset: "fate-turnback",
        topLeft: true,
        topRight: true,
        bottomRight: true,
        bottomLeft: true,
      },
      topOrnament: {
        preset: "fate",
        align: "center",
        offset: 0,
        text: "FATE CORE ASPECTS",
        fontFamily: "Montserrat Alternates",
        fontSize: 10,
        fontWeight: "medium",
        letterSpacingPx: -0.9,
      },
      bottomOrnament: {
        preset: "dnd",
        align: "center",
        offset: 0,
        text: "LEVEL 5 HERO",
        fontFamily: "Montserrat Alternates",
        fontSize: 10,
        fontWeight: "bold",
        letterSpacingPx: 0.5,
      },
      box: {
        ...defaultBoxProps,
        strokeWidth: { top: 1, right: 1, bottom: 1, left: 1 },
        strokeColor: "default",
        padding: { top: 24, right: 16, bottom: 24, left: 16 },
      },
      children: [
        {
          id: "550e8400-e29b-41d4-a716-446655440401",
          kind: "text",
          text: "High Concept: Star-Touched Wanderer",
          variant: "body",
          align: "left",
          weight: "normal",
          fontFamily: "Noto Sans",
          uppercase: false,
          color: "default",
          box: defaultBoxProps,
        },
      ],
    };

    const pdfBytes = await generateA4SheetPdf({
      layout,
      title: "Fate & D&D Ornaments PDF",
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
