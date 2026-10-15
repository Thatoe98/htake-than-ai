import { describe, expect, it } from "vitest";
import { computeCostUsd, FALLBACK_PRICES, getPrices } from "./cost";

describe("cost", () => {
  it("prices tokens per million", () => {
    const prices = { inPerM: 0.5, outPerM: 2, isFallback: false };
    expect(computeCostUsd({ inputTokens: 1_000_000, outputTokens: 500_000 }, prices)).toBe(1.5);
    expect(computeCostUsd({ inputTokens: 2000, outputTokens: 300 }, prices)).toBeCloseTo(0.0016, 6);
  });

  it("treats missing usage as zero", () => {
    expect(computeCostUsd({}, FALLBACK_PRICES)).toBe(0);
  });

  it("reads prices from the environment", () => {
    const p = getPrices({ OPENAI_PRICE_IN_PER_M: "0.2", OPENAI_PRICE_OUT_PER_M: "1.25" });
    expect(p).toEqual({ inPerM: 0.2, outPerM: 1.25, isFallback: false });
  });

  it("falls back to a high price when prices are not configured, so the cap errs on the safe side", () => {
    expect(getPrices({})).toBe(FALLBACK_PRICES);
    expect(getPrices({ OPENAI_PRICE_IN_PER_M: "abc", OPENAI_PRICE_OUT_PER_M: "1" })).toBe(FALLBACK_PRICES);
    expect(getPrices({ OPENAI_PRICE_IN_PER_M: "0.2" })).toBe(FALLBACK_PRICES);
  });
});
