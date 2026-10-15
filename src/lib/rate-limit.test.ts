import { describe, expect, it } from "vitest";
import { createLimiter } from "./rate-limit";

describe("createLimiter", () => {
  it("blocks after max hits in the window, per key", () => {
    const l = createLimiter({ max: 2, windowMs: 1000 });
    expect(l.check("a", 0).ok).toBe(true);
    expect(l.check("a", 100).ok).toBe(true);
    const blocked = l.check("a", 200);
    expect(blocked.ok).toBe(false);
    expect(blocked.ok === false && blocked.retryAfterSec).toBe(1);
    expect(l.check("b", 200).ok).toBe(true);
  });

  it("allows again once old hits leave the window", () => {
    const l = createLimiter({ max: 1, windowMs: 1000 });
    expect(l.check("a", 0).ok).toBe(true);
    expect(l.check("a", 999).ok).toBe(false);
    expect(l.check("a", 1000).ok).toBe(true);
  });
});
