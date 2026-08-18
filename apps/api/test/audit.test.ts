import { describe, expect, it } from "vitest";
import { AuditService } from "../src/modules/audit/service.js";

describe("AuditService metadata sanitization", () => {
  it("redacts sensitive fields like apiKey, token, password", () => {
    const service = new AuditService({} as any);
    const sanitized = (service as any).sanitizeMetadata({
      provider: "openai",
      apiKey: "sk-secret-key-12345",
      password: "my-super-secret",
      nested: {
        token: "jwt-token-abcd",
        model: "gpt-4",
      },
    });

    expect(sanitized).toEqual({
      provider: "openai",
      apiKey: "[REDACTED]",
      password: "[REDACTED]",
      nested: {
        token: "[REDACTED]",
        model: "gpt-4",
      },
    });
  });

  it("truncates oversized metadata", () => {
    const service = new AuditService({} as any);
    const hugeObject: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) {
      hugeObject[`key_${i}`] = "a".repeat(100);
    }
    const sanitized = (service as any).sanitizeMetadata(hugeObject);
    expect(sanitized).toMatchObject({
      _truncated: true,
    });
  });
});
