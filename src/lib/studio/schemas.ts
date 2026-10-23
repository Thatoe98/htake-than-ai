// Style and brief for the content studio (spec sections 4 and 5). Pure: no database, no AI.
import { z } from "zod";

const WRITING_EXTRA_MAX = 300;
const IMAGE_EXTRA_MAX = 200;

/**
 * Free text goes into a prompt inside tags, so angle brackets are dropped (it cannot open or close a tag), control
 * characters are removed, blank runs are collapsed and the length is limited.
 */
export function sanitizeFreeText(s: string, max: number): string {
  const noControls = Array.from(s)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return ch === "\n" || ch === "\t" || (code >= 32 && code !== 127);
    })
    .join("");
  return noControls
    .replace(/[<>]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

const cleaned = (max: number) => z.string().transform((s) => sanitizeFreeText(s, max));

const writingFields = {
  language: z.enum(["my", "en", "both"]),
  tone: z.enum(["friendly", "professional", "energetic", "trustworthy"]),
  length: z.enum(["short", "medium", "long"]),
  emoji: z.enum(["none", "light", "lots"]),
  hashtags: z.enum(["off", "few"]),
  extra: cleaned(WRITING_EXTRA_MAX),
};

const imageFields = {
  preset: z.enum(["product_photo", "lifestyle", "minimal_studio", "bold_promo"]),
  mood: z.enum(["bright", "warm", "cool_tech", "dark_premium"]),
  aspect: z.enum(["square", "portrait"]),
  extra: cleaned(IMAGE_EXTRA_MAX),
};

export const writingStyleSchema = z.object(writingFields);
export const imageStyleSchema = z.object(imageFields);
export type WritingStyle = z.infer<typeof writingStyleSchema>;
export type ImageStyle = z.infer<typeof imageStyleSchema>;

export const WRITING_DEFAULT: WritingStyle = {
  language: "my",
  tone: "friendly",
  length: "medium",
  emoji: "light",
  hashtags: "few",
  extra: "",
};

export const IMAGE_DEFAULT: ImageStyle = { preset: "product_photo", mood: "bright", aspect: "square", extra: "" };

/** Field by field: a valid value is kept, an invalid or missing one falls back to the default. */
function parseFields<T extends Record<string, unknown>>(
  fields: { [K in keyof T]: z.ZodType<T[K], unknown> },
  defaults: T,
  value: unknown,
): T {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out = { ...defaults };
  for (const key of Object.keys(fields) as (keyof T)[]) {
    const r = fields[key].safeParse(source[key as string]);
    if (r.success) out[key] = r.data;
  }
  return out;
}

export const parseWritingStyle = (v: unknown): WritingStyle => parseFields<WritingStyle>(writingFields, WRITING_DEFAULT, v);
export const parseImageStyle = (v: unknown): ImageStyle => parseFields<ImageStyle>(imageFields, IMAGE_DEFAULT, v);

/** Over-long fields are rejected, not cut, so the writer notices instead of losing facts silently. */
export const briefSchema = z.object({
  topic: z.string().max(200).transform((s) => sanitizeFreeText(s, 200)).pipe(z.string().min(1)),
  goal: z.enum(["promote", "announce", "educate", "engage"]).default("promote"),
  facts: z.string().max(800).transform((s) => sanitizeFreeText(s, 800)).default(""),
  cta: z.string().max(120).transform((s) => sanitizeFreeText(s, 120)).default(""),
});
export type Brief = z.infer<typeof briefSchema>;

export function parseBrief(v: unknown): { ok: true; value: Brief } | { ok: false; error: string } {
  const r = briefSchema.safeParse(v);
  if (r.success) return { ok: true, value: r.data };
  const field = String(r.error.issues[0]?.path[0] ?? "brief");
  return { ok: false, error: `Please check the ${field} field.` };
}
