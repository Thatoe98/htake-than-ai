import { describe, expect, it } from "vitest";
import {
  billableSeconds,
  buildKeywords,
  buildTranscribePrompt,
  extensionFor,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  transcribeCostUsd,
  transcribePricePerMin,
  validateUpload,
} from "./transcribe";

describe("validateUpload", () => {
  it("accepts a normal browser recording", () => {
    expect(validateUpload({ size: 40_000, type: "audio/webm;codecs=opus", seconds: 6 })).toEqual({ ok: true });
    expect(validateUpload({ size: 40_000, type: "audio/mp4", seconds: 6 })).toEqual({ ok: true });
  });
  it("rejects non-audio types", () => {
    const r = validateUpload({ size: 1000, type: "text/html", seconds: 5 });
    expect(r.ok).toBe(false);
  });
  it("rejects empty and oversized files", () => {
    expect(validateUpload({ size: 0, type: "audio/webm", seconds: 5 }).ok).toBe(false);
    expect(validateUpload({ size: MAX_AUDIO_BYTES + 1, type: "audio/webm", seconds: 5 }).ok).toBe(false);
  });
  it("rejects clips that are too short or too long", () => {
    expect(validateUpload({ size: 1000, type: "audio/webm", seconds: 0.3 })).toMatchObject({ ok: false, code: "too_short" });
    expect(validateUpload({ size: 1000, type: "audio/webm", seconds: MAX_AUDIO_SECONDS + 5 })).toMatchObject({ ok: false, code: "too_long" });
  });
  it("rejects a missing or non-numeric duration", () => {
    expect(validateUpload({ size: 1000, type: "audio/webm", seconds: Number.NaN }).ok).toBe(false);
  });
});

describe("extensionFor", () => {
  it("maps mime types to file extensions the API accepts", () => {
    expect(extensionFor("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionFor("audio/mp4")).toBe("mp4");
    expect(extensionFor("audio/x-m4a")).toBe("m4a");
    expect(extensionFor("audio/mpeg")).toBe("mp3");
    expect(extensionFor("audio/wav")).toBe("wav");
    expect(extensionFor("audio/ogg;codecs=opus")).toBe("ogg");
  });
});

describe("buildKeywords", () => {
  it("joins names on one line", () => {
    expect(buildKeywords(["ကိုအောင်ကျော်ဇော", "Thida Win"])).toBe("ကိုအောင်ကျော်ဇော, Thida Win");
  });
  it("drops forbidden characters, blanks and duplicates", () => {
    const out = buildKeywords(["A<b>", "  ", "Zed\nQ", "Zed Q", "Zed Q"]);
    expect(out).not.toMatch(/[<>\r\n]/);
    expect(out.split(", ").filter((s) => s === "Zed Q")).toHaveLength(1);
  });
  it("keeps the total length bounded", () => {
    const names = Array.from({ length: 200 }, (_, i) => `Person Number ${i}`);
    expect(buildKeywords(names).length).toBeLessThanOrEqual(600);
  });
  it("returns an empty string with no names", () => {
    expect(buildKeywords([])).toBe("");
  });
});

describe("buildTranscribePrompt", () => {
  it("asks for Myanmar script", () => {
    expect(buildTranscribePrompt()).toMatch(/Myanmar script/);
    expect(buildTranscribePrompt()).toMatch(/မြန်မာ/);
  });
});

describe("billableSeconds", () => {
  it("trusts the client duration within bounds", () => {
    expect(billableSeconds({ clientSeconds: 12, bytes: 20_000 })).toBe(12);
  });
  it("uses the file size when the client under-reports", () => {
    // 200 KB cannot be 2 seconds of speech at the lowest bitrate we accept; bill by size instead.
    expect(billableSeconds({ clientSeconds: 2, bytes: 200_000 })).toBeGreaterThan(2);
  });
  it("never bills more than the maximum", () => {
    expect(billableSeconds({ clientSeconds: 999, bytes: MAX_AUDIO_BYTES })).toBe(MAX_AUDIO_SECONDS);
  });
});

describe("cost", () => {
  it("uses the documented price per minute", () => {
    expect(transcribeCostUsd(60, 0.0045)).toBeCloseTo(0.0045, 6);
    expect(transcribeCostUsd(10, 0.0045)).toBeCloseTo(0.00075, 6);
  });
  it("reads the price from env with a safe fallback", () => {
    expect(transcribePricePerMin({ OPENAI_PRICE_TRANSCRIBE_PER_MIN: "0.01" })).toBe(0.01);
    expect(transcribePricePerMin({})).toBeGreaterThanOrEqual(0.0045);
    expect(transcribePricePerMin({ OPENAI_PRICE_TRANSCRIBE_PER_MIN: "abc" })).toBeGreaterThanOrEqual(0.0045);
  });
});
