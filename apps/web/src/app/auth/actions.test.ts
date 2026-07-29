import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, cookieStore, redirect } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  cookieStore: { set: vi.fn() },
  redirect: vi.fn((location: string) => {
    const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${location};307;`;
    throw error;
  }),
}));

vi.mock("@/lib/api/server", () => ({ apiFetch }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({ redirect }));

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "hero@example.com",
};

function formData(values: Record<string, string>) {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.set(key, value));
  return form;
}

describe("authentication actions", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    cookieStore.set.mockReset();
    redirect.mockClear();
    apiFetch.mockResolvedValue({
      data: { user },
      headers: new Headers({
        "set-cookie": "mycharacter_session=opaque-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
      }),
      status: 200,
    });
  });

  it("redirects after API login succeeds and forwards its session cookie", async () => {
    const { signIn } = await import("@/app/auth/actions");

    await expect(
      signIn({}, formData({
        email: user.email,
        password: "correct horse battery staple",
        next: "/dashboard",
      })),
    ).rejects.toMatchObject({ digest: expect.stringContaining("/dashboard") });

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
    expect(cookieStore.set).toHaveBeenCalledWith(
      "mycharacter_session",
      "opaque-token",
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
  });

  it("rejects protocol-relative login redirects", async () => {
    const { signIn } = await import("@/app/auth/actions");

    await expect(
      signIn({}, formData({
        email: user.email,
        password: "correct horse battery staple",
        next: "//attacker.example",
      })),
    ).rejects.toMatchObject({ digest: expect.stringContaining("/dashboard") });
  });

  it("clears the local session cookie when API logout fails", async () => {
    apiFetch.mockRejectedValue(new Error("API unavailable"));
    const { signOut } = await import("@/app/auth/actions");

    await expect(signOut()).rejects.toMatchObject({
      digest: expect.stringContaining("/"),
    });

    expect(cookieStore.set).toHaveBeenCalledWith(
      "mycharacter_session",
      "",
      expect.objectContaining({ maxAge: 0, path: "/" }),
    );
  });
});
