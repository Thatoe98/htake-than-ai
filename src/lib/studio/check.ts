// What the model returned, and the checks run on it in code (spec section 7). Pure: no database, no AI.
import { z } from "zod";
import type { Brief, WritingStyle } from "./schemas";

export const captionOutputSchema = z.object({
  caption: z.string(),
  hashtags: z.array(z.string()),
  imageIdea: z.string(),
  missingFacts: z.array(z.string()),
});
export type CaptionOutput = z.infer<typeof captionOutputSchema>;

/** Characters, per language when both are written. Matches the numbers in the length prompt lines. */
export const CAPTION_MAX: Record<WritingStyle["length"], number> = { short: 300, medium: 600, long: 1000 };

const HASHTAGS_MAX = 5;
const MISSING_FACTS_MAX = 6;

const BURMESE_DIGITS = "၀၁၂၃၄၅၆၇၈၉";

function normaliseNumber(raw: string): string {
  const ascii = Array.from(raw)
    .map((ch) => {
      const i = BURMESE_DIGITS.indexOf(ch);
      return i === -1 ? ch : String(i);
    })
    .join("");
  return ascii.replace(/,/g, "").replace(/\.+$/, "");
}

function numbersIn(text: string): string[] {
  return (text.match(/[0-9၀-၉][0-9၀-၉,.]*/g) ?? []).map(normaliseNumber).filter((n) => n !== "");
}

/** Numbers in the caption that the brief does not contain (commas ignored, Burmese digits read as ASCII). */
export function inventedNumbers(caption: string, brief: Brief): string[] {
  const known = new Set(numbersIn(`${brief.topic}\n${brief.facts}\n${brief.cta}`));
  return [...new Set(numbersIn(caption))].filter((n) => !known.has(n));
}

const hasBurmese = (s: string) => /[က-႟]/.test(s);
const length = (s: string) => Array.from(s).length;

/** One text per language: for "both", the leading Burmese paragraphs and the rest; otherwise the whole caption. */
function languageParts(caption: string, language: WritingStyle["language"]): string[] {
  if (language !== "both") return [caption];
  const paragraphs = caption.split(/\n\s*\n/);
  const firstOther = paragraphs.findIndex((p) => !hasBurmese(p));
  if (firstOther <= 0) return [caption];
  return [paragraphs.slice(0, firstOther).join("\n\n"), paragraphs.slice(firstOther).join("\n\n")];
}

function cleanHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const tag of tags) {
    const body = tag.replace(/\s+/g, "").replace(/^#+/, "");
    if (body) seen.add(`#${body}`);
  }
  return [...seen].slice(0, HASHTAGS_MAX);
}

/** Tidies the model output and lists what is still wrong with it. Never throws. */
export function finalizeCaption(
  out: CaptionOutput,
  style: WritingStyle,
  brief: Brief,
): { value: CaptionOutput; problems: string[] } {
  const caption = out.caption.trim();
  const value: CaptionOutput = {
    caption,
    hashtags: style.hashtags === "off" ? [] : cleanHashtags(out.hashtags),
    imageIdea: out.imageIdea.trim(),
    missingFacts: out.missingFacts.map((f) => f.trim()).filter(Boolean).slice(0, MISSING_FACTS_MAX),
  };

  const problems: string[] = [];
  if (!caption) problems.push("The caption is empty.");
  const invented = inventedNumbers(caption, brief);
  if (invented.length) problems.push(`The caption has numbers that are not in the brief: ${invented.join(", ")}.`);
  const max = CAPTION_MAX[style.length];
  if (languageParts(caption, style.language).some((part) => length(part) > max)) {
    problems.push(`The caption is too long for the ${style.length} setting (more than ${max} characters).`);
  }
  return { value, problems };
}
