import { describe, expect, it } from "vitest";
import { CAPTION_MAX, captionOutputSchema, finalizeCaption, inventedNumbers, type CaptionOutput } from "./check";
import { WRITING_DEFAULT, type Brief } from "./schemas";

const brief: Brief = { topic: "20,000 mAh power bank", goal: "promote", facts: "Two USB ports. Price 1500 Ks.", cta: "Order by 5" };
const out = (over: Partial<CaptionOutput> = {}): CaptionOutput => ({
  caption: "Phone at 5% already?\n\nThis power bank has two USB ports.\n\nMessage us.",
  hashtags: [],
  imageIdea: "A hand holding a power bank.",
  missingFacts: [],
  ...over,
});

describe("inventedNumbers", () => {
  it("accepts numbers that appear in the topic, facts or call to action", () => {
    expect(inventedNumbers("20,000 mAh for 1500 Ks, order by 5", brief)).toEqual([]);
  });

  it("ignores commas, so 1,500 equals 1500", () => {
    expect(inventedNumbers("Only 1,500 Ks", brief)).toEqual([]);
    expect(inventedNumbers("20000 mAh", brief)).toEqual([]);
  });

  it("returns numbers that are not in the brief, once each", () => {
    expect(inventedNumbers("Save 30% today, 30% off, 2 years warranty", brief)).toEqual(["30", "2"]);
  });

  it("turns Burmese digits into ASCII before comparing", () => {
    expect(inventedNumbers("၁၅၀၀ ကျပ်", brief)).toEqual([]);
    expect(inventedNumbers("၃၀၀ ကျပ်", brief)).toEqual(["300"]);
  });

  it("does not count a sentence-ending full stop as part of the number", () => {
    expect(inventedNumbers("Order by 5.", brief)).toEqual([]);
  });

  it("keeps decimals", () => {
    expect(inventedNumbers("Type-C 3.5 A", brief)).toEqual(["3.5"]);
  });

  it("finds nothing when the caption has no digits", () => {
    expect(inventedNumbers("Two ports, one power bank.", brief)).toEqual([]);
  });
});

describe("captionOutputSchema", () => {
  it("accepts the four fields and rejects a missing one", () => {
    expect(captionOutputSchema.safeParse(out()).success).toBe(true);
    const { caption, hashtags, imageIdea } = out();
    expect(captionOutputSchema.safeParse({ caption, hashtags, imageIdea }).success).toBe(false);
  });
});

describe("finalizeCaption", () => {
  it("returns no problems for a clean output", () => {
    const r = finalizeCaption(out(), WRITING_DEFAULT, brief);
    expect(r.problems).toEqual([]);
    expect(r.value.caption).toContain("two USB ports");
  });

  it("keeps at most 5 hashtags and gives each a # prefix, once", () => {
    const tags = ["a", "#b", "c c", "##d", "e", "f", "g", "h"];
    const r = finalizeCaption(out({ hashtags: tags }), WRITING_DEFAULT, brief);
    expect(r.value.hashtags).toEqual(["#a", "#b", "#cc", "#d", "#e"]);
  });

  it("drops duplicate and empty hashtags", () => {
    const r = finalizeCaption(out({ hashtags: ["#a", "a", "", "#"] }), WRITING_DEFAULT, brief);
    expect(r.value.hashtags).toEqual(["#a"]);
  });

  it("empties the hashtags when the style turns them off", () => {
    const r = finalizeCaption(out({ hashtags: ["#a"] }), { ...WRITING_DEFAULT, hashtags: "off" }, brief);
    expect(r.value.hashtags).toEqual([]);
  });

  it("keeps at most 6 missing facts", () => {
    const r = finalizeCaption(out({ missingFacts: ["1", "2", "3", "4", "5", "6", "7", " "] }), WRITING_DEFAULT, brief);
    expect(r.value.missingFacts).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("reports an empty caption", () => {
    const r = finalizeCaption(out({ caption: "  \n " }), WRITING_DEFAULT, brief);
    expect(r.problems.length).toBeGreaterThan(0);
  });

  it("reports a caption over the cap for its length setting", () => {
    expect(CAPTION_MAX).toEqual({ short: 300, medium: 600, long: 1000 });
    const r = finalizeCaption(out({ caption: "x".repeat(700) }), { ...WRITING_DEFAULT, length: "short" }, brief);
    expect(r.problems.some((p) => p.includes("long"))).toBe(true);
    expect(finalizeCaption(out({ caption: "x".repeat(700) }), { ...WRITING_DEFAULT, length: "long" }, brief).problems).toEqual([]);
  });

  it("measures each language on its own when both are requested", () => {
    const my = "က".repeat(250);
    const en = "x".repeat(250);
    const both = { ...WRITING_DEFAULT, language: "both" as const, length: "short" as const };
    // 500 characters in total, but each half is under 300
    expect(finalizeCaption(out({ caption: `${my}\n\n${en}` }), both, brief).problems).toEqual([]);
    // one half over 300
    const r = finalizeCaption(out({ caption: `${my}\n\n${"x".repeat(320)}` }), both, brief);
    expect(r.problems.some((p) => p.includes("long"))).toBe(true);
  });

  it("lists invented numbers as a problem naming them", () => {
    const r = finalizeCaption(out({ caption: "Save 30% on this power bank" }), WRITING_DEFAULT, brief);
    expect(r.problems.some((p) => p.includes("30"))).toBe(true);
  });

  it("never throws on odd input", () => {
    expect(() => finalizeCaption(out({ hashtags: [""], missingFacts: [], caption: "" }), WRITING_DEFAULT, brief)).not.toThrow();
  });
});
