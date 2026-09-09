// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentPresence } from "./agent-presence";
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows an agent cursor at normalized canvas coordinates and syncs the editor", async () => {
  const onSync = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          agents: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              resourceType: "sheet",
              resourceId: "22222222-2222-4222-8222-222222222222",
              target: "desktop",
              x: 0.25,
              y: 0.75,
              status: "Editing notes",
              name: "Guide",
              updatedAt: "2026-09-08T00:00:00Z",
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    ),
  );
  render(
    <AgentPresence
      resourceType="sheet"
      resourceId="22222222-2222-4222-8222-222222222222"
      target="desktop"
      onSync={onSync}
    />,
  );
  const status = await screen.findByText("Editing notes");
  expect(status.parentElement?.parentElement).toHaveStyle({
    left: "25%",
    top: "75%",
  });
  expect(onSync).toHaveBeenCalled();
});
