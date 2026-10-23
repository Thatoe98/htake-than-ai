// The studio pipeline (spec sections 5 to 7). The two AI calls are injected, so this stays pure and testable.
import { type CaptionOutput, finalizeCaption, inventedNumbers } from "./check";
import { buildCaptionPrompt, buildImagePrompt, IMAGE_SIZE } from "./prompt";
import type { Brief, ImageStyle, WritingStyle } from "./schemas";

type Usage = { inputTokens?: number; outputTokens?: number };

export type StudioDeps = {
  writeCaption(args: { system: string; prompt: string }): Promise<{ output: CaptionOutput; usage: Usage }>;
  drawImage(args: { prompt: string; size: string }): Promise<{ base64: string; mediaType: string; usage?: Usage }>;
};

type Call = { kind: "text" | "image"; usage?: Usage };
type Picture = { base64: string; mediaType: string };

export type StudioResult = {
  caption: CaptionOutput;
  warnings: string[];
  image: Picture | null;
  imageError: string | null;
  calls: Call[];
};

const IMAGE_ERROR_MAX = 200;

/** One retry when the caption holds a number that is not in the brief; what is left over becomes a warning. */
export async function produceCaption(
  input: { style: WritingStyle; brief: Brief },
  deps: StudioDeps,
): Promise<{ caption: CaptionOutput; warnings: string[]; calls: Call[] }> {
  const { system, prompt } = buildCaptionPrompt(input.style, input.brief);
  const first = await deps.writeCaption({ system, prompt });
  const calls: Call[] = [{ kind: "text", usage: first.usage }];
  let done = finalizeCaption(first.output, input.style, input.brief);

  const bad = inventedNumbers(done.value.caption, input.brief);
  if (bad.length) {
    const retryPrompt = `${prompt}\n\nYour previous draft used numbers that are not in the brief (${bad.join(", ")}). Write the post again without them.`;
    try {
      const second = await deps.writeCaption({ system, prompt: retryPrompt });
      calls.push({ kind: "text", usage: second.usage });
      done = finalizeCaption(second.output, input.style, input.brief);
    } catch {
      // keep the first draft; its problems are shown as warnings
    }
  }
  return { caption: done.value, warnings: done.problems, calls };
}

/** Never throws: a failed image leaves the caption usable. */
export async function produceImage(
  input: { imageStyle: ImageStyle; imageIdea: string },
  deps: StudioDeps,
): Promise<{ image: Picture | null; imageError: string | null; calls: Call[] }> {
  try {
    const r = await deps.drawImage({
      prompt: buildImagePrompt(input.imageStyle, input.imageIdea),
      size: IMAGE_SIZE[input.imageStyle.aspect],
    });
    return { image: { base64: r.base64, mediaType: r.mediaType }, imageError: null, calls: [{ kind: "image", usage: r.usage }] };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { image: null, imageError: message.slice(0, IMAGE_ERROR_MAX) || "Image failed.", calls: [] };
  }
}

export async function produce(
  input: { style: WritingStyle; imageStyle: ImageStyle; brief: Brief },
  deps: StudioDeps,
): Promise<StudioResult> {
  const text = await produceCaption({ style: input.style, brief: input.brief }, deps);
  const imageIdea = text.caption.imageIdea || `${input.brief.topic} in everyday use.`;
  const picture = await produceImage({ imageStyle: input.imageStyle, imageIdea }, deps);
  return {
    caption: text.caption,
    warnings: text.warnings,
    image: picture.image,
    imageError: picture.imageError,
    calls: [...text.calls, ...picture.calls],
  };
}
