import { describe, expect, it, vi } from "vitest";
import type { CaptionOutput } from "./check";
import { produce, produceCaption, produceImage, type StudioDeps } from "./generate";
import { IMAGE_DEFAULT, WRITING_DEFAULT, type Brief } from "./schemas";

const brief: Brief = { topic: "20,000 mAh power bank", goal: "promote", facts: "Two USB ports.", cta: "" };
const clean: CaptionOutput = {
  caption: "Phone at 10% already?\n\nTwo USB ports.\n\nMessage us.".replace("10%", "low battery"),
  hashtags: [],
  imageIdea: "A hand holding a power bank on a cafe table.",
  missingFacts: ["price"],
};
const invented: CaptionOutput = { ...clean, caption: "Save 30% today.\n\nTwo USB ports.\n\nMessage us." };
const usage = { inputTokens: 100, outputTokens: 50 };
const img = { base64: "AAAA", mediaType: "image/png", usage: { inputTokens: 80, outputTokens: 1000 } };

function deps(over: Partial<StudioDeps> = {}): StudioDeps & {
  writeCaption: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
} {
  return {
    writeCaption: vi.fn().mockResolvedValue({ output: clean, usage }),
    drawImage: vi.fn().mockResolvedValue(img),
    ...over,
  } as never;
}

describe("produceCaption", () => {
  it("makes one text call when the first output is clean", async () => {
    const d = deps();
    const r = await produceCaption({ style: WRITING_DEFAULT, brief }, d);
    expect(d.writeCaption).toHaveBeenCalledTimes(1);
    expect(r.warnings).toEqual([]);
    expect(r.calls).toEqual([{ kind: "text", usage }]);
  });

  it("retries once when a number is invented, naming it in the second prompt", async () => {
    const d = deps();
    d.writeCaption.mockResolvedValueOnce({ output: invented, usage }).mockResolvedValueOnce({ output: clean, usage });
    const r = await produceCaption({ style: WRITING_DEFAULT, brief }, d);
    expect(d.writeCaption).toHaveBeenCalledTimes(2);
    expect(d.writeCaption.mock.calls[1][0].prompt).toContain("30");
    expect(d.writeCaption.mock.calls[1][0].prompt).toContain("<brief>");
    expect(r.warnings).toEqual([]);
    expect(r.caption.caption).toBe(clean.caption);
    expect(r.calls).toHaveLength(2);
  });

  it("returns the result with a warning when the number is still invented after the retry", async () => {
    const d = deps({ writeCaption: vi.fn().mockResolvedValue({ output: invented, usage }) });
    const r = await produceCaption({ style: WRITING_DEFAULT, brief }, d);
    expect(d.writeCaption).toHaveBeenCalledTimes(2);
    expect(r.warnings.some((w) => w.includes("30"))).toBe(true);
    expect(r.caption.caption).toContain("30%");
  });

  it("keeps the first draft, with its warning, when the retry call fails", async () => {
    const d = deps();
    d.writeCaption.mockResolvedValueOnce({ output: invented, usage }).mockRejectedValueOnce(new Error("boom"));
    const r = await produceCaption({ style: WRITING_DEFAULT, brief }, d);
    expect(r.warnings.some((w) => w.includes("30"))).toBe(true);
    expect(r.calls).toHaveLength(1);
  });

  it("rejects when the first call fails", async () => {
    const d = deps({ writeCaption: vi.fn().mockRejectedValue(new Error("down")) });
    await expect(produceCaption({ style: WRITING_DEFAULT, brief }, d)).rejects.toThrow("down");
  });
});

describe("produceImage", () => {
  it("draws with the style's size and a prompt that holds the idea", async () => {
    const d = deps();
    const r = await produceImage({ imageStyle: { ...IMAGE_DEFAULT, aspect: "portrait" }, imageIdea: "a lamp on a desk" }, d);
    const arg = d.drawImage.mock.calls[0][0];
    expect(arg.size).toBe("1024x1536");
    expect(arg.prompt).toContain("a lamp on a desk");
    expect(r.image).toEqual({ base64: "AAAA", mediaType: "image/png" });
    expect(r.imageError).toBeNull();
    expect(r.calls).toEqual([{ kind: "image", usage: img.usage }]);
  });

  it("never throws: a failing draw gives no image and an error text", async () => {
    const d = deps({ drawImage: vi.fn().mockRejectedValue(new Error("content policy")) });
    const r = await produceImage({ imageStyle: IMAGE_DEFAULT, imageIdea: "x" }, d);
    expect(r.image).toBeNull();
    expect(r.imageError).toContain("content policy");
    expect(r.calls).toEqual([]);
  });
});

describe("produce", () => {
  it("writes the caption, then draws from its image idea", async () => {
    const d = deps();
    const r = await produce({ style: WRITING_DEFAULT, imageStyle: IMAGE_DEFAULT, brief }, d);
    expect(d.drawImage.mock.calls[0][0].prompt).toContain(clean.imageIdea);
    expect(r.caption.caption).toBe(clean.caption);
    expect(r.image?.base64).toBe("AAAA");
    expect(r.calls.map((c) => c.kind)).toEqual(["text", "image"]);
  });

  it("falls back to the topic when the model gives no image idea", async () => {
    const d = deps({ writeCaption: vi.fn().mockResolvedValue({ output: { ...clean, imageIdea: " " }, usage }) });
    await produce({ style: WRITING_DEFAULT, imageStyle: IMAGE_DEFAULT, brief }, d);
    expect(d.drawImage.mock.calls[0][0].prompt).toContain("20,000 mAh power bank");
  });

  it("keeps the caption when the image fails", async () => {
    const d = deps({ drawImage: vi.fn().mockRejectedValue(new Error("nope")) });
    const r = await produce({ style: WRITING_DEFAULT, imageStyle: IMAGE_DEFAULT, brief }, d);
    expect(r.caption.caption).toBe(clean.caption);
    expect(r.image).toBeNull();
    expect(r.imageError).toBeTruthy();
  });

  it("rejects, and draws nothing, when the caption call fails", async () => {
    const d = deps({ writeCaption: vi.fn().mockRejectedValue(new Error("down")) });
    await expect(produce({ style: WRITING_DEFAULT, imageStyle: IMAGE_DEFAULT, brief }, d)).rejects.toThrow("down");
    expect(d.drawImage).not.toHaveBeenCalled();
  });
});
