import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MyCharacterClient } from "../src/client.js";
import { createMyCharacterMcpServer } from "../src/server.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("agent MCP protocol", () => {
  it("lists full authoring schemas and executes tools through the MCP transport", async () => {
    const api = new MyCharacterClient({ token: "test-token" });
    const request = vi
      .spyOn(api, "requestApi")
      .mockResolvedValue({ id: "new-system" });
    const { server } = createMyCharacterMcpServer({ client: api });
    const agent = new Client({ name: "test-agent", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      agent.connect(clientTransport),
    ]);
    try {
      const { tools } = await agent.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "mycharacter_create_sheet",
          "mycharacter_save_sheet_draft",
          "mycharacter_update_sheet_field",
          "mycharacter_set_presence",
        ]),
      );
      const result = await agent.callTool({
        name: "mycharacter_create_game_system",
        arguments: { input: { title: "Test" } },
      });
      expect(result.isError).not.toBe(true);
      expect(request).toHaveBeenCalledWith(
        "/api/game-systems",
        expect.objectContaining({ method: "POST" }),
      );
      const invalid = await agent.callTool({
        name: "mycharacter_save_sheet_draft",
        arguments: { id: "bad", input: {} },
      });
      expect(invalid.isError).toBe(true);
    } finally {
      await agent.close();
      await server.close();
    }
  });

  it("retries heartbeat after a transient outage and stops on disconnect", async () => {
    vi.useFakeTimers();
    const client = new MyCharacterClient({ token: "test-token" });
    const request = vi
      .spyOn(client, "requestApi")
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValue({});
    await client.setPresence({
      resourceType: "sheet",
      resourceId: "11111111-1111-4111-8111-111111111111",
      target: "desktop",
      x: 0.5,
      y: 0.5,
      status: "Editing",
    });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(request).toHaveBeenCalledTimes(3);
    await client.close();
    expect(request).toHaveBeenLastCalledWith("/api/agent-presence", {
      method: "DELETE",
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("sends a bearer token without cookies and refuses redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: "agent" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new MyCharacterClient({
      token: "test-token",
      baseUrl: "http://localhost:8080",
    });
    client.setCookie("session", "browser-session");
    await client.getMyProfile();
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.get("Authorization")).toBe("Bearer test-token");
    expect(init.headers.has("Cookie")).toBe(false);
    expect(init.redirect).toBe("error");
    await expect(client.requestApi("https://external.test")).rejects.toThrow(
      "Invalid API path",
    );
  });
});
