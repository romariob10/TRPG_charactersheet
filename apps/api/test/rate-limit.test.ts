import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter } from "../src/plugins/rate-limit.js";

describe("InMemoryRateLimiter", () => {
  it("allows requests under the limit and blocks when exceeded", () => {
    const limiter = new InMemoryRateLimiter();
    const key = "test:user1";

    const r1 = limiter.consume(key, 2, 10000);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = limiter.consume(key, 2, 10000);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    const r3 = limiter.consume(key, 2, 10000);
    expect(r3.allowed).toBe(false);
    expect(r3.retryAfterSec).toBeGreaterThan(0);

    expect(() => limiter.assertLimit(key, 2, 10000)).toThrow();
  });
});
