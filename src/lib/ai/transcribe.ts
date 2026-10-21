// Pure helpers for voice input: a recording is turned into text on the server and then sent as a normal chat
// message. No database or network access here, so the rules can be tested on their own.

export const MAX_AUDIO_SECONDS = 60;
export const MIN_AUDIO_SECONDS = 1;
/** 60 s at 128 kbit/s (more than any phone browser records speech at) is under 1 MB; this leaves headroom. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
/** Highest plausible speech bitrate in bytes per second: a recording cannot be shorter than size / this. */
const MAX_BYTES_PER_SECOND = 16_000;

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

const baseType = (type: string) => type.split(";")[0].trim().toLowerCase();

export const extensionFor = (type: string): string => EXTENSIONS[baseType(type)] ?? "webm";

export type UploadCheck =
  | { ok: true }
  | { ok: false; code: "bad_type" | "empty" | "too_big" | "too_short" | "too_long" | "bad_duration"; error: string };

export function validateUpload(args: { size: number; type: string; seconds: number }): UploadCheck {
  if (!(baseType(args.type) in EXTENSIONS)) return { ok: false, code: "bad_type", error: "That is not a supported audio recording." };
  if (!(args.size > 0)) return { ok: false, code: "empty", error: "The recording is empty." };
  if (args.size > MAX_AUDIO_BYTES) return { ok: false, code: "too_big", error: "That recording is too large." };
  if (!Number.isFinite(args.seconds)) return { ok: false, code: "bad_duration", error: "Invalid request." };
  if (args.seconds < MIN_AUDIO_SECONDS) return { ok: false, code: "too_short", error: "The recording is too short." };
  if (args.seconds > MAX_AUDIO_SECONDS + 2) {
    return { ok: false, code: "too_long", error: `Please keep a voice message under ${MAX_AUDIO_SECONDS} seconds.` };
  }
  return { ok: true };
}

/**
 * Tells the model the audio is Burmese and that the answer must be written in Myanmar script. Without this,
 * auto-detect writes Latin letters (or Chinese) for Burmese speech, which is useless in the chat.
 */
export function buildTranscribePrompt(): string {
  return (
    "ဤအသံသည် မြန်မာဘာသာစကား (Burmese) ဖြစ်သည်။ မြန်မာအက္ခရာဖြင့်သာ ရေးပါ။ အင်္ဂလိပ်စကားလုံး ပါလာလျှင် ထိုအတိုင်း ရေးပါ။ " +
    "This is Burmese speech. Transcribe in Myanmar script (Unicode), not romanization."
  );
}

const KEYWORDS_MAX_CHARS = 600;

/** Names the speaker is likely to say, on one line (the API rejects <, > and line breaks in keywords). */
export function buildKeywords(names: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  let length = 0;
  for (const raw of names) {
    const name = raw.replace(/[<>\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    if (!name || seen.has(name)) continue;
    const next = length + name.length + (out.length ? 2 : 0);
    if (next > KEYWORDS_MAX_CHARS) break;
    seen.add(name);
    out.push(name);
    length = next;
  }
  return out.join(", ");
}

/**
 * Seconds to bill and log. The client reports the duration, but a client can lie, so a recording is never
 * counted as shorter than its size allows. Capped at the maximum.
 */
export function billableSeconds(args: { clientSeconds: number; bytes: number }): number {
  const claimed = Number.isFinite(args.clientSeconds) ? args.clientSeconds : 0;
  const fromSize = args.bytes / MAX_BYTES_PER_SECOND;
  return Math.min(MAX_AUDIO_SECONDS, Math.max(claimed, fromSize));
}

/** gpt-transcribe is $0.0045 per minute (OpenAI pricing page, Oct 2026). The fallback errs high for the cap. */
export const FALLBACK_TRANSCRIBE_PER_MIN = 0.006;

export function transcribePricePerMin(env: Record<string, string | undefined> = process.env): number {
  const raw = env.OPENAI_PRICE_TRANSCRIBE_PER_MIN;
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : FALLBACK_TRANSCRIBE_PER_MIN;
}

export function transcribeCostUsd(seconds: number, perMin: number = transcribePricePerMin()): number {
  return Math.round((seconds / 60) * perMin * 1e6) / 1e6;
}
