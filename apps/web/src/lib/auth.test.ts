import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api/server", () => ({ apiFetch }));

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "hero@example.com",
};

describe("getSession", () => {
  beforeEach(() => apiFetch.mockReset());

  it("returns the authenticated API session for the current request", async () => {
    apiFetch.mockResolvedValue({ data: { user } });
    const { getSession } = await import("@/lib/auth");

    await expect(getSession()).resolves.toEqual({ user });
  });

  it("does not reuse a previous request's session", async () => {
    apiFetch.mockResolvedValueOnce({ data: { user } }).mockResolvedValueOnce({
      data: { user: { ...user, email: "other@example.com" } },
    });
    const { getSession } = await import("@/lib/auth");

    await expect(getSession()).resolves.toEqual({ user });
    await expect(getSession()).resolves.toEqual({
      user: { ...user, email: "other@example.com" },
    });
  });
});
