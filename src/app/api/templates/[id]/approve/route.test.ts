import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: async () => ({
    user: { id: "22222222-2222-4222-8222-222222222222" },
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "11111111-1111-4111-8111-111111111111",
                    catalog_status: "ready",
                  },
                }),
              }),
            }),
          }),
        }),
      }),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === "pdf_fields"
        ? {
            select: () => ({
              eq: () => ({
                eq: async () => ({ count: 1, error: null }),
              }),
            }),
          }
        : {
            update: () => ({
              eq: () => ({
                eq: () => ({
                  is: async () => ({ error: null }),
                }),
              }),
            }),
          },
  }),
}));

describe("template approval route", () => {
  beforeEach(() => revalidatePath.mockClear());

  it("invalidates template lists after approval", async () => {
    const { POST } = await import("@/app/api/templates/[id]/approve/route");
    const response = await POST(
      new Request("http://localhost/api/templates/id/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      }),
      {
        params: Promise.resolve({
          id: "11111111-1111-4111-8111-111111111111",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/systems");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/new");
  });
});
