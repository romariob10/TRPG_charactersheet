// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentTokenSettings } from "./agent-token-settings";
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const metadata = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Guide",
  prefix: "mcp_test",
  createdAt: "2026-09-08T00:00:00Z",
  expiresAt: "2026-12-08T00:00:00Z",
  lastUsedAt: null,
};
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
describe("agent token settings", () => {
  it("creates a token once and removes it when revoked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ tokens: [] }))
      .mockResolvedValueOnce(json({ metadata, token: "mcp_test_secret" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentTokenSettings />);
    await screen.findByText("empty");
    fireEvent.change(screen.getByLabelText("name"), {
      target: { value: "Guide" },
    });
    fireEvent.click(screen.getByRole("button", { name: "create" }));
    const token = await screen.findByLabelText("token");
    expect(token).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "dismiss" }));
    expect(screen.queryByLabelText("token")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "revoke" }));
    await screen.findByText("empty");
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/agent-tokens/${metadata.id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });
  it("shows request errors without claiming a token was created", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(json({ tokens: [] }))
        .mockResolvedValueOnce(new Response(null, { status: 500 })),
    );
    render(<AgentTokenSettings />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("error"),
    );
    expect(screen.queryByLabelText("token")).not.toBeInTheDocument();
  });
});
