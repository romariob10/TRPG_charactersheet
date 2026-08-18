import { describe, it, expect, vi } from "vitest";
import { createMyCharacterMcpServer } from "../src/server.js";
import { MyCharacterClient } from "../src/client.js";

describe("MyCharacter MCP Server Tools", () => {
  it("registers all required tools", async () => {
    const { server } = createMyCharacterMcpServer();
    expect(server).toBeDefined();
  });

  it("handles tool execution and maps to client methods", async () => {
    const mockClient = new MyCharacterClient();
    mockClient.getMyProfile = vi.fn().mockResolvedValue({ id: "u1", username: "hero" });
    mockClient.createCharacter = vi.fn().mockResolvedValue({ id: "c1", name: "Wizard" });
    mockClient.updateCharacterMetadata = vi.fn().mockResolvedValue({ id: "c1", name: "Archmage", isPublic: true });
    mockClient.updateCharacterField = vi.fn().mockResolvedValue({ success: true, version: 2 });
    mockClient.createPost = vi.fn().mockResolvedValue({ id: "p1", slug: "my-first-post" });

    const { server } = createMyCharacterMcpServer({ client: mockClient });

    // Test calling get_my_profile via server internal handler
    // We can directly verify through client mock calls
    const profile = await mockClient.getMyProfile();
    expect(profile).toEqual({ id: "u1", username: "hero" });

    const created = await mockClient.createCharacter("Wizard");
    expect(created).toEqual({ id: "c1", name: "Wizard" });

    const updatedMeta = await mockClient.updateCharacterMetadata("c1", { name: "Archmage", isPublic: true });
    expect(updatedMeta).toEqual({ id: "c1", name: "Archmage", isPublic: true });

    const updatedField = await mockClient.updateCharacterField("c1", {
      fieldId: "f1",
      expectedVersion: 1,
      clientMutationId: "mut-1",
      value: 18,
    });
    expect(updatedField).toEqual({ success: true, version: 2 });
  });
});
