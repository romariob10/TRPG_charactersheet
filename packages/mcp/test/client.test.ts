import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MyCharacterClient, markdownToBlocks } from "../src/client.js";

describe("MyCharacterClient", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("initializes with default port 8080 and origin", () => {
    const client = new MyCharacterClient();
    expect(client.baseUrl).toBe("http://localhost:8080");
    expect(client.origin).toBe("http://localhost:8080");
  });

  it("attaches Origin and Cookie headers on mutations", async () => {
    const client = new MyCharacterClient({
      baseUrl: "http://localhost:8080",
      origin: "http://localhost:8080",
    });

    client.setCookie("session", "test-session-token");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ id: "char-1", name: "Ranger" }),
    });
    global.fetch = mockFetch;

    await client.createCharacter("Ranger");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:8080/api/characters");
    expect(options.method).toBe("POST");

    const headers = options.headers as Headers;
    expect(headers.get("Origin")).toBe("http://localhost:8080");
    expect(headers.get("Cookie")).toBe("session=test-session-token");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("updates cookie jar from Set-Cookie response header", async () => {
    const client = new MyCharacterClient();

    const responseHeaders = new Headers();
    responseHeaders.append("set-cookie", "session=new-auth-token; Path=/; HttpOnly");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: responseHeaders,
      json: async () => ({ user: { id: "u1", email: "hero@example.com" } }),
    });

    const user = await client.login("hero@example.com", "secretpass");
    expect(user.id).toBe("u1");
    expect(client.getCookieHeader()).toBe("session=new-auth-token");
  });
});

describe("markdownToBlocks converter", () => {
  it("converts headers, quotes, lists, delimiters, and paragraphs", () => {
    const markdown = `# Adventure Log
This is a story about a brave explorer.

> Do not go gentle into that good night.

---

## Equipment
- Sword
- Shield
- Torch

1. First step
2. Second step`;

    const blocks = markdownToBlocks(markdown);
    expect(blocks.length).toBe(7);

    expect(blocks[0]).toEqual({
      type: "header",
      data: { text: "Adventure Log", level: 2 },
    });

    expect(blocks[1]).toEqual({
      type: "paragraph",
      data: { text: "This is a story about a brave explorer." },
    });

    expect(blocks[2]).toEqual({
      type: "quote",
      data: { text: "Do not go gentle into that good night.", caption: "" },
    });

    expect(blocks[3]).toEqual({
      type: "delimiter",
      data: {},
    });

    expect(blocks[4]).toEqual({
      type: "header",
      data: { text: "Equipment", level: 2 },
    });

    expect(blocks[5]).toEqual({
      type: "list",
      data: { style: "unordered", items: ["Sword", "Shield", "Torch"] },
    });

    expect(blocks[6]).toEqual({
      type: "list",
      data: { style: "ordered", items: ["First step", "Second step"] },
    });
  });
});
