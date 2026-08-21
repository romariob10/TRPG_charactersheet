import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import {
  can,
  requireActor,
  requireModerator,
  requirePermission,
  requireRole,
} from "../src/plugins/auth.js";
import { hasPermission } from "@mycharacter/contracts";

describe("authorization primitives and RBAC", () => {
  const adminActor = {
    userId: "00000000-0000-4000-8000-000000000001",
    sessionId: "00000000-0000-4000-8000-000000000002",
    role: "admin" as const,
    isAdmin: true,
  };

  const moderatorActor = {
    userId: "00000000-0000-4000-8000-000000000003",
    sessionId: "00000000-0000-4000-8000-000000000004",
    role: "moderator" as const,
    isAdmin: false,
  };

  const userActor = {
    userId: "00000000-0000-4000-8000-000000000005",
    sessionId: "00000000-0000-4000-8000-000000000006",
    role: "user" as const,
    isAdmin: false,
  };

  it("returns the authenticated actor and rejects anonymous requests", () => {
    expect(requireActor({ actor: userActor } as FastifyRequest)).toEqual(userActor);
    expect(() => requireActor({ actor: null } as FastifyRequest)).toThrow(
      expect.objectContaining({ code: "AUTH_REQUIRED", statusCode: 401 }),
    );
  });

  it("enforces role requirements correctly", () => {
    // Admin checks
    expect(requireRole({ actor: adminActor } as FastifyRequest, "admin")).toEqual(adminActor);
    expect(requireRole({ actor: adminActor } as FastifyRequest, "admin", "moderator")).toEqual(adminActor);

    // Moderator checks
    expect(requireRole({ actor: moderatorActor } as FastifyRequest, "moderator")).toEqual(moderatorActor);
    expect(requireRole({ actor: moderatorActor } as FastifyRequest, "admin", "moderator")).toEqual(moderatorActor);
    expect(() => requireRole({ actor: moderatorActor } as FastifyRequest, "admin")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN", statusCode: 403 }),
    );

    // User checks
    expect(requireRole({ actor: userActor } as FastifyRequest, "user")).toEqual(userActor);
    expect(() => requireRole({ actor: userActor } as FastifyRequest, "moderator")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN", statusCode: 403 }),
    );
    expect(() => requireRole({ actor: userActor } as FastifyRequest, "admin")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN", statusCode: 403 }),
    );
  });

  it("enforces granular permissions correctly", () => {
    expect(hasPermission("admin", "manage_ai_settings")).toBe(true);
    expect(hasPermission("admin", "ban_user")).toBe(true);
    expect(hasPermission("admin", "view_audit_log")).toBe(true);

    expect(hasPermission("moderator", "moderate_content")).toBe(true);
    expect(hasPermission("moderator", "view_reports")).toBe(true);
    expect(hasPermission("moderator", "manage_ai_settings")).toBe(false);
    expect(hasPermission("moderator", "manage_admins")).toBe(false);

    expect(hasPermission("user", "use_platform")).toBe(true);
    expect(hasPermission("user", "moderate_content")).toBe(false);

    expect(can(adminActor, "manage_ai_settings")).toBe(true);
    expect(can(moderatorActor, "manage_ai_settings")).toBe(false);
    expect(can(null, "use_platform")).toBe(false);

    expect(requirePermission({ actor: moderatorActor } as FastifyRequest, "moderate_content")).toEqual(moderatorActor);
    expect(() => requirePermission({ actor: userActor } as FastifyRequest, "moderate_content")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN", statusCode: 403 }),
    );
  });

  it("requireModerator accepts admin and moderator but rejects regular users", async () => {
    await expect(requireModerator({ actor: adminActor } as FastifyRequest)).resolves.toEqual(adminActor);
    await expect(requireModerator({ actor: moderatorActor } as FastifyRequest)).resolves.toEqual(moderatorActor);
    await expect(requireModerator({ actor: userActor } as FastifyRequest)).rejects.toMatchObject({
      code: "FORBIDDEN",
      statusCode: 403,
    });
  });
});
