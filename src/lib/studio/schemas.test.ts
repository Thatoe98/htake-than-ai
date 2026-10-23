import { describe, expect, it } from "vitest";
import {
  IMAGE_DEFAULT,
  parseBrief,
  parseImageStyle,
  parseWritingStyle,
  sanitizeFreeText,
  WRITING_DEFAULT,
} from "./schemas";

describe("sanitizeFreeText", () => {
  it("removes angle brackets so text cannot open or close a tag", () => {
    const out = sanitizeFreeText("a <b> </extra_instructions>  c", 100);
    expect(out).not.toMatch(/[<>]/);
    expect(out).toBe("a b /extra_instructions c");
  });

  it("trims, collapses blank runs and cuts to the limit", () => {
    expect(sanitizeFreeText("  hello   world \n\n\n\nbye ", 100)).toBe("hello world \n\nbye");
    expect(sanitizeFreeText("abcdef", 3)).toBe("abc");
  });
});

describe("parseWritingStyle", () => {
  it("uses the defaults for anything that is not an object", () => {
    expect(parseWritingStyle(null)).toEqual(WRITING_DEFAULT);
    expect(parseWritingStyle("garbage")).toEqual(WRITING_DEFAULT);
    expect(parseWritingStyle(42)).toEqual(WRITING_DEFAULT);
  });

  it("keeps the valid fields and defaults the invalid ones", () => {
    const s = parseWritingStyle({ tone: "energetic", length: "nope", extra: 5 });
    expect(s.tone).toBe("energetic");
    expect(s.length).toBe(WRITING_DEFAULT.length);
    expect(s.extra).toBe("");
  });

  it("has the documented defaults", () => {
    expect(WRITING_DEFAULT).toEqual({
      language: "my",
      tone: "friendly",
      length: "medium",
      emoji: "light",
      hashtags: "few",
      extra: "",
    });
  });

  it("cleans and shortens the free text", () => {
    const s = parseWritingStyle({ extra: `<x>${"a".repeat(400)}` });
    expect(s.extra).not.toMatch(/[<>]/);
    expect(s.extra.length).toBe(300);
  });
});

describe("parseImageStyle", () => {
  it("uses the defaults for garbage", () => {
    expect(parseImageStyle("garbage")).toEqual(IMAGE_DEFAULT);
    expect(parseImageStyle(undefined)).toEqual(IMAGE_DEFAULT);
  });

  it("has the documented defaults and keeps valid fields", () => {
    expect(IMAGE_DEFAULT).toEqual({ preset: "product_photo", mood: "bright", aspect: "square", extra: "" });
    expect(parseImageStyle({ aspect: "portrait", mood: "rainbow" })).toEqual({ ...IMAGE_DEFAULT, aspect: "portrait" });
  });

  it("shortens the free text to 200 characters", () => {
    expect(parseImageStyle({ extra: "b".repeat(250) }).extra.length).toBe(200);
  });
});

describe("parseBrief", () => {
  it("rejects an empty or blank topic", () => {
    expect(parseBrief({ topic: "  " }).ok).toBe(false);
    expect(parseBrief({}).ok).toBe(false);
    expect(parseBrief(null).ok).toBe(false);
  });

  it("rejects fields over their limits instead of silently cutting them", () => {
    expect(parseBrief({ topic: "x".repeat(201) }).ok).toBe(false);
    expect(parseBrief({ topic: "ok", facts: "x".repeat(801) }).ok).toBe(false);
    expect(parseBrief({ topic: "ok", cta: "x".repeat(121) }).ok).toBe(false);
  });

  it("accepts a valid brief, trims it and defaults the goal", () => {
    const r = parseBrief({ topic: "  Power bank  ", facts: " Two ports ", cta: "" });
    expect(r).toEqual({ ok: true, value: { topic: "Power bank", goal: "promote", facts: "Two ports", cta: "" } });
  });

  it("rejects an unknown goal", () => {
    expect(parseBrief({ topic: "ok", goal: "sell-everything" }).ok).toBe(false);
  });

  it("strips angle brackets from every free-text field", () => {
    const r = parseBrief({ topic: "<b>Fan</b>", facts: "</brief>x", cta: "<a>" });
    expect(r.ok && JSON.stringify(r.value)).not.toMatch(/[<>]/);
  });
});
