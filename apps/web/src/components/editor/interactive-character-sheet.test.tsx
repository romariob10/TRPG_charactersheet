// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CharacterField, FieldKind, FieldValue } from "@/lib/types";
import {
  arrangeInteractiveSections,
  buildInteractiveLayout,
  InteractiveCharacterSheet,
} from "./interactive-character-sheet";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.name ? `${key}: ${String(values.name)}` : key,
}));

function field(
  id: string,
  label: string,
  kind: FieldKind,
  overrides: Partial<CharacterField> = {},
): CharacterField {
  return {
    id,
    pdfName: id,
    kind,
    label,
    aliases: [],
    section: "Core",
    page: 1,
    options: [],
    groupId: null,
    groupOrder: null,
    confidence: 0.9,
    source: "vision",
    widgets: [
      {
        id: `${id}-widget`,
        page: 1,
        rect: [0.1, 0.1, 0.4, 0.16],
        pdfRect: [10, 10, 40, 16],
        rotation: 0,
        exportValue: null,
      },
    ],
    value: null,
    version: 0,
    updatedAt: "2026-08-20T00:00:00.000Z",
    updatedBy: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe("InteractiveCharacterSheet", () => {
  it("turns catalog sections and AI group order into stable form sections", () => {
    const groupId = "11111111-1111-4111-8111-111111111111";
    const sections = arrangeInteractiveSections([
      field("spell-2", "Second spell", "text", {
        groupId,
        groupOrder: 1,
        widgets: [
          {
            id: "spell-2-widget",
            page: 1,
            rect: [0.1, 0.2, 0.4, 0.26],
            pdfRect: [10, 20, 40, 26],
            rotation: 0,
            exportValue: null,
          },
        ],
      }),
      field("spell-1", "First spell", "text", {
        groupId,
        groupOrder: 0,
        widgets: [
          {
            id: "spell-1-widget",
            page: 1,
            rect: [0.1, 0.3, 0.4, 0.36],
            pdfRect: [10, 30, 40, 36],
            rotation: 0,
            exportValue: null,
          },
        ],
      }),
      field("notes", "Notes", "multiline", {
        section: null,
        page: 2,
        widgets: [],
      }),
    ]);

    expect(sections.map((section) => section.title)).toEqual(["Core", null]);
    expect(sections[0].fields.map((item) => item.id)).toEqual([
      "spell-1",
      "spell-2",
    ]);
  });

  it("creates unique ASCII-safe section ids for ARIA relationships", () => {
    const sections = arrangeInteractiveSections([
      field("space", "Space", "text", { section: "Combat Notes" }),
      field("dash", "Dash", "text", { section: "Combat-Notes" }),
      field("cyrillic", "Cyrillic", "text", { section: "Бой" }),
    ]);

    expect(sections.map((section) => section.id)).toEqual([
      "section-combat-notes",
      "section-combat-notes-2",
      expect.stringMatching(/^section-[a-z0-9-]+$/),
    ]);
    expect(new Set(sections.map((section) => section.id)).size).toBe(3);
    expect(sections.every((section) => /^[a-z0-9-]+$/.test(section.id))).toBe(
      true,
    );
  });

  it("composes existing catalog metadata into rich reusable blocks", () => {
    const layout = buildInteractiveLayout([
      field("strength", "Strength score", "text", {
        section: "Characteristics",
      }),
      field("strength-mod", "Strength modifier", "text", {
        section: "Characteristics",
      }),
      field("strength-save", "Strength save", "text", {
        section: "Characteristics",
      }),
      field("athletics-trained", "Athletics proficiency", "checkbox", {
        section: "Skills",
      }),
      field("athletics-bonus", "Athletics bonus", "text", {
        section: "Skills",
      }),
      field("hp-current", "Current HP", "text", {
        section: "Resources",
        value: "7",
      }),
      field("hp-max", "Maximum HP", "text", {
        section: "Resources",
        value: "10",
      }),
      field("attack-1-name", "Attack 1 name", "text", {
        section: "Attacks",
      }),
      field("attack-1-bonus", "Attack 1 bonus", "text", {
        section: "Attacks",
      }),
      field("attack-2-name", "Attack 2 name", "text", {
        section: "Attacks",
      }),
      field("attack-2-bonus", "Attack 2 bonus", "text", {
        section: "Attacks",
      }),
      field("notes", "Notes", "multiline", { section: "Notes" }),
      field("alignment", "Alignment", "dropdown", {
        section: "Identity",
        options: ["Good", "Neutral"],
      }),
      field("portrait", "Portrait reference", "text", {
        section: "Identity",
      }),
    ]);

    expect(
      Object.fromEntries(
        layout.map((section) => [
          section.title,
          section.blocks.map((block) => block.kind),
        ]),
      ),
    ).toEqual({
      Characteristics: ["stats"],
      Skills: ["skills"],
      Resources: ["resources"],
      Attacks: ["table"],
      Notes: ["text"],
      Identity: ["options", "fields"],
    });

    const table = layout
      .find((section) => section.title === "Attacks")
      ?.blocks.find((block) => block.kind === "table");
    expect(table?.kind === "table" ? table.rows : []).toHaveLength(2);
    expect(
      layout
        .flatMap((section) => section.blocks)
        .flatMap((block) => {
          if (block.kind === "resources") {
            return block.tracks.flatMap((track) => track.fields);
          }
          if (block.kind === "stats" || block.kind === "skills") {
            return block.rows.flatMap((row) => row.fields);
          }
          if (block.kind === "table") {
            return block.rows.flatMap((row) => row.fields);
          }
          return block.fields;
        }),
    ).toHaveLength(14);
  });

  it("uses a trusted compound group for generic stat role labels", () => {
    const abilityGroupId = "11111111-1111-4111-8111-111111111111";
    const unrelatedGroupId = "22222222-2222-4222-8222-222222222222";
    const stats = buildInteractiveLayout([
      field("strength", "Сила", "text", {
        section: "Характеристики",
        groupId: abilityGroupId,
        groupOrder: 0,
      }),
      field("strength-check", "Проверка", "text", {
        section: "Характеристики",
        groupId: abilityGroupId,
        groupOrder: 1,
      }),
      field("strength-save", "Испытание", "text", {
        section: "Характеристики",
        groupId: abilityGroupId,
        groupOrder: 2,
      }),
      field("hair", "Волосы", "text", {
        section: "Характеристики",
        groupId: unrelatedGroupId,
        groupOrder: 0,
      }),
      field("age", "Возраст", "text", {
        section: "Характеристики",
        groupId: unrelatedGroupId,
        groupOrder: 1,
      }),
    ])[0]?.blocks.find((block) => block.kind === "stats");

    expect(stats?.kind).toBe("stats");
    if (stats?.kind !== "stats") return;
    expect(stats.rows).toHaveLength(3);
    expect(stats.rows[0]).toMatchObject({
      label: "Сила",
      fields: [
        expect.objectContaining({ id: "strength-check" }),
        expect.objectContaining({ id: "strength-save" }),
        expect.objectContaining({ id: "strength" }),
      ],
    });
    expect(stats.rows.slice(1).map((row) => row.label)).toEqual([
      "Волосы",
      "Возраст",
    ]);
  });

  it("recognizes unnumbered repeated table rows from widget geometry", () => {
    const widget = (id: string, left: number, top: number) => ({
      id,
      page: 1,
      rect: [left, top, left + 0.2, top + 0.05] as [
        number,
        number,
        number,
        number,
      ],
      pdfRect: [
        left * 100,
        top * 100,
        (left + 0.2) * 100,
        (top + 0.05) * 100,
      ] as [number, number, number, number],
      rotation: 0,
      exportValue: null,
    });
    const table = buildInteractiveLayout([
      field("weapon-a-name", "Name", "text", {
        section: "Attacks",
        widgets: [widget("weapon-a-name-widget", 0.1, 0.1)],
      }),
      field("weapon-a-bonus", "Bonus", "text", {
        section: "Attacks",
        widgets: [widget("weapon-a-bonus-widget", 0.5, 0.105)],
      }),
      field("weapon-b-name", "Name", "text", {
        section: "Attacks",
        widgets: [widget("weapon-b-name-widget", 0.1, 0.3)],
      }),
      field("weapon-b-bonus", "Bonus", "text", {
        section: "Attacks",
        widgets: [widget("weapon-b-bonus-widget", 0.5, 0.305)],
      }),
    ])[0]?.blocks.find((block) => block.kind === "table");

    expect(table?.kind).toBe("table");
    if (table?.kind !== "table") return;
    expect(table.rows.map((row) => row.fields.map((item) => item.id))).toEqual([
      ["weapon-a-name", "weapon-a-bonus"],
      ["weapon-b-name", "weapon-b-bonus"],
    ]);
  });

  it("uses accessible responsive controls backed by the shared field values", () => {
    const onFieldChange = vi.fn<(fieldId: string, value: FieldValue) => void>();
    const onFieldFocus = vi.fn<(fieldId: string) => void>();
    const onFieldBlur = vi.fn<(fieldId: string) => void>();
    render(
      <InteractiveCharacterSheet
        fields={[
          field("name", "Character name", "text", { value: "Aeris" }),
          field("alive", "Alive", "checkbox", { value: false }),
          field("notes", "Notes", "multiline", { value: "Ready" }),
        ]}
        activeFieldId={null}
        remoteCollaboratorsByFieldId={new Map()}
        onFieldChange={onFieldChange}
        onFieldFocus={onFieldFocus}
        onFieldBlur={onFieldBlur}
      />,
    );

    fireEvent.change(screen.getByLabelText("Character name"), {
      target: { value: "Aeris Storm" },
    });
    fireEvent.click(screen.getByLabelText("Alive"));
    fireEvent.focus(screen.getByLabelText("Notes"));
    fireEvent.blur(screen.getByLabelText("Notes"));

    expect(onFieldChange).toHaveBeenCalledWith("name", "Aeris Storm");
    expect(onFieldChange).toHaveBeenCalledWith("alive", true);
    expect(onFieldFocus).toHaveBeenCalledWith("notes");
    expect(onFieldBlur).toHaveBeenCalledWith("notes");
  });

  it("exposes responsive sections as tabs and keeps compound controls accessible", () => {
    render(
      <InteractiveCharacterSheet
        fields={[
          field("strength", "Strength score", "text", {
            section: "Characteristics",
            value: "15",
          }),
          field("strength-mod", "Strength modifier", "text", {
            section: "Characteristics",
            value: "+2",
          }),
          field("hp-current", "Current HP", "text", {
            section: "Resources",
            value: "7",
          }),
          field("hp-max", "Maximum HP", "text", {
            section: "Resources",
            value: "10",
          }),
          field("attack-1-name", "Attack 1 name", "text", {
            section: "Attacks",
          }),
          field("attack-1-bonus", "Attack 1 bonus", "text", {
            section: "Attacks",
          }),
          field("attack-2-name", "Attack 2 name", "text", {
            section: "Attacks",
          }),
          field("attack-2-bonus", "Attack 2 bonus", "text", {
            section: "Attacks",
          }),
        ]}
        activeFieldId={null}
        remoteCollaboratorsByFieldId={new Map()}
        onFieldChange={vi.fn()}
        onFieldFocus={vi.fn()}
        onFieldBlur={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("tablist", { name: "adaptiveTitle" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Strength score")).toHaveValue("15");

    fireEvent.click(screen.getByRole("tab", { name: /Resources/ }));
    expect(screen.getByRole("progressbar", { name: "HP" })).toHaveAttribute(
      "aria-valuenow",
      "70",
    );
    expect(screen.getByLabelText("Current HP")).toHaveValue("7");

    fireEvent.click(screen.getByRole("tab", { name: /Attacks/ }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });
});
