import { describe, expect, it } from "vitest";
import { RateLimiter, type RateLimitOptions } from "../src/rateLimit.js";

const loose = { max: 1000, ms: 30_000 };
function limiter(overrides: Partial<RateLimitOptions>): RateLimiter {
  return new RateLimiter({ userCooldownMs: 0, channel: loose, guild: loose, global: loose, ...overrides });
}

describe("RateLimiter", () => {
  it("enforces a per-user cooldown", () => {
    const l = limiter({ userCooldownMs: 3000 });
    expect(l.consume("u1", "c1", "g1", 0)).toBe(true);
    expect(l.consume("u1", "c1", "g1", 1000)).toBe(false);
    expect(l.consume("u1", "c1", "g1", 3000)).toBe(true);
  });

  it("caps hits per channel window", () => {
    const l = limiter({ channel: { max: 2, ms: 30_000 } });
    expect(l.consume("u1", "c1", "g1", 0)).toBe(true);
    expect(l.consume("u2", "c1", "g1", 1)).toBe(true);
    expect(l.consume("u3", "c1", "g1", 2)).toBe(false);
    expect(l.consume("u3", "c2", "g1", 2)).toBe(true);
    expect(l.consume("u3", "c1", "g1", 30_001)).toBe(true);
  });

  it("caps hits per server and globally", () => {
    const perGuild = limiter({ guild: { max: 1, ms: 60_000 } });
    expect(perGuild.consume("u1", "c1", "g1", 0)).toBe(true);
    expect(perGuild.consume("u2", "c2", "g1", 0)).toBe(false);
    expect(perGuild.consume("u2", "c2", "g2", 0)).toBe(true);

    const global = limiter({ global: { max: 2, ms: 10_000 } });
    expect(global.consume("u1", "c1", "g1", 0)).toBe(true);
    expect(global.consume("u2", "c2", "g2", 0)).toBe(true);
    expect(global.consume("u3", "c3", "g3", 0)).toBe(false);
  });

  it("canConsume doesn't record a hit", () => {
    const l = limiter({ userCooldownMs: 3000 });
    expect(l.canConsume("u1", "c1", "g1", 0)).toBe(true);
    expect(l.canConsume("u1", "c1", "g1", 0)).toBe(true);
    expect(l.consume("u1", "c1", "g1", 0)).toBe(true);
    expect(l.canConsume("u1", "c1", "g1", 1)).toBe(false);
  });

  it("sweeps expired entries", () => {
    const l = limiter({ userCooldownMs: 10, channel: { max: 1, ms: 10 } });
    l.consume("u1", "c1", "g1", 0);
    l.sweep(100);
    expect(l.consume("u1", "c1", "g1", 100)).toBe(true);
  });
});
