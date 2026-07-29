import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CharacterCard } from "@/components/character-card";

const character = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Герой",
  role: "owner",
  revision: 0,
  status: "active",
  deletedAt: null,
  updatedAt: "2026-07-20T00:00:00.000Z",
  pageCount: 3,
  catalogStatus: "ready",
};

vi.mock("@/lib/api/server", () => ({
  apiFetch: async () => ({
    data: { items: [character] },
    headers: new Headers(),
    status: 200,
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
  it("renders character summaries returned by the local API", async () => {
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
