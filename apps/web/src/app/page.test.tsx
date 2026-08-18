import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getSession }));
vi.mock("@/components/site-header", () => ({
  SiteHeader: () => <header />,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

describe("Home", () => {
  it("shows dashboard links for an authenticated API session", async () => {
    getSession.mockResolvedValue({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "hero@example.com",
      },
    });
    const { default: Home } = await import("@/app/page");
    const html = renderToStaticMarkup(await Home());

    expect(html).toContain('href="/dashboard/new"');
    expect(html).toContain('href="/dashboard/feed"');
  });
});
