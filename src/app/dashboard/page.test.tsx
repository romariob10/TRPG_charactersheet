import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CharacterCard } from "@/components/character-card";

const characterRow = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Герой",
  owner_id: "22222222-2222-4222-8222-222222222222",
  revision: 0,
  status: "active",
  deleted_at: null,
  updated_at: "2026-07-20T00:00:00.000Z",
  pdf_templates: {
    page_count: 3,
    catalog_status: "ready",
  },
};

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: async () => ({
    user: { id: characterRow.owner_id },
    supabase: {
      from: () => ({
        select: () => ({
          order: async () => ({ data: [characterRow], error: null }),
        }),
      }),
    },
  }),
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "ru",
  getTranslations: async () => (key: string) => key,
}));

function findCharacterCard(node: ReactNode): React.ReactElement | null {
  if (!isValidElement(node)) return null;
  if (node.type === CharacterCard) return node;
  const props = node.props as { children?: ReactNode };
  for (const child of Children.toArray(props.children)) {
    const found = findCharacterCard(child);
    if (found) return found;
  }
  return null;
}

describe("DashboardPage", () => {
  it("reads a many-to-one template relation returned as an object", async () => {
    const { default: DashboardPage } = await import("@/app/dashboard/page");
    const page = await DashboardPage();
    const card = findCharacterCard(page);

    expect(card).not.toBeNull();
    expect(
      (card?.props as { character: { catalogStatus: string } }).character
        .catalogStatus,
    ).toBe("ready");
  });
});
