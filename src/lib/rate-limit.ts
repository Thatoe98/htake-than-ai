// Sliding-window limiter, in memory. Fine for one web container per client (one Compose project per client).
export function createLimiter(opts: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return {
    check(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        return { ok: false, retryAfterSec: Math.ceil((opts.windowMs - (now - recent[0])) / 1000) };
      }
      recent.push(now);
      hits.set(key, recent);
      return { ok: true };
    },
  };
}
