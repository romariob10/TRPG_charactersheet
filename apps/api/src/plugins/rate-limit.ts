import { AppError } from "../errors.js";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  consume(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; retryAfterSec: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
    }

    if (bucket.count >= limit) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    bucket.count += 1;
    return { allowed: true, remaining: limit - bucket.count, retryAfterSec: 0 };
  }

  assertLimit(key: string, limit: number, windowMs: number): void {
    const res = this.consume(key, limit, windowMs);
    if (!res.allowed) {
      throw new AppError(
        "RATE_LIMIT_EXCEEDED",
        429,
        `Too many requests. Please try again in ${res.retryAfterSec} seconds.`,
      );
    }
  }

  // Cleanup expired buckets every few minutes
  cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(key);
      }
    }
  }
}

export const globalRateLimiter = new InMemoryRateLimiter();
setInterval(() => globalRateLimiter.cleanup(), 60000);
