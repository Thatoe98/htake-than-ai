import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { hasOpenAIKey, MODEL_IDS } from "@/lib/ai/models";
import { loadRosterNames } from "@/lib/ai/roster-data";
import {
  billableSeconds,
  buildKeywords,
  buildTranscribePrompt,
  extensionFor,
  MAX_AUDIO_BYTES,
  transcribeCostUsd,
  validateUpload,
} from "@/lib/ai/transcribe";
import { canAssignTasks } from "@/lib/permissions";
import { createLimiter } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { getMonthlyCapUsd, getMonthSpendUsd, getTimezone } from "@/lib/settings";

export const maxDuration = 60;

const limiter = createLimiter({ max: 12, windowMs: 60_000 }); // voice messages per user
const MAX_TRANSCRIPT_CHARS = 4000; // same limit as a typed chat message

const fail = (status: number, code: string, error: string, extra?: Record<string, string>) =>
  Response.json({ error, code }, { status, headers: extra });

/**
 * Turns one voice recording into text. The audio is sent to the speech model and then dropped: it is never
 * stored. The text goes back to the browser, which sends it as an ordinary chat message, so the chat history,
 * visibility rules and approval cards all work exactly as for typed messages.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return fail(401, "auth", "Not signed in.");
  const user = session.user;
  if (user.banned) return fail(403, "auth", "This account is deactivated.");
  if (user.mustChangePassword || !user.noticeAcceptedAt) return fail(403, "auth", "Finish first-login setup.");

  const rate = limiter.check(user.id);
  if (!rate.ok) return fail(429, "rate", "Too many voice messages. Please wait a moment.", { "retry-after": String(rate.retryAfterSec) });

  if (!hasOpenAIKey()) return fail(503, "config", "The AI service is not configured yet.");

  // Refuse a huge body before reading it into memory.
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES + 64 * 1024) {
    return fail(413, "too_big", "That recording is too large.");
  }

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!form || !(audio instanceof File)) return fail(400, "invalid", "Invalid request.");
  const clientSeconds = Number(form.get("seconds"));

  const check = validateUpload({ size: audio.size, type: audio.type, seconds: clientSeconds });
  if (!check.ok) return fail(check.code === "too_big" ? 413 : 400, check.code, check.error);

  const tz = await getTimezone();
  const [cap, spent] = await Promise.all([getMonthlyCapUsd(), getMonthSpendUsd(tz)]);
  if (spent >= cap) return fail(429, "cap", "The monthly AI budget has been reached. Please contact your admin.");

  // Only the CEO assigns tasks by name, so only the CEO's recordings get the team's names as spelling hints.
  const keywords = canAssignTasks({ id: user.id, role: user.role }) ? buildKeywords(await loadRosterNames()) : "";

  const upstream = new FormData();
  upstream.append("file", audio, `voice.${extensionFor(audio.type)}`);
  upstream.append("model", MODEL_IDS.transcribe);
  upstream.append("prompt", buildTranscribePrompt());
  if (keywords) upstream.append("keywords", keywords);

  let text = "";
  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: upstream,
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) {
      console.error("[transcribe] upstream", res.status, (await res.text()).slice(0, 300));
      return fail(502, "upstream", "Could not understand the recording. Please try again.");
    }
    text = String(((await res.json()) as { text?: unknown }).text ?? "").trim();
  } catch (e) {
    console.error("[transcribe] request failed", e);
    return fail(502, "upstream", "Could not understand the recording. Please try again.");
  }

  // The provider charges for the audio whether or not it found speech, so log before looking at the text.
  const seconds = billableSeconds({ clientSeconds, bytes: audio.size });
  await db
    .insert(aiUsage)
    .values({ userId: user.id, feature: "transcribe", model: MODEL_IDS.transcribe, costUsd: String(transcribeCostUsd(seconds)) })
    .catch((e) => console.error("[transcribe] could not log usage", e));

  if (!text) return fail(422, "no_speech", "I could not hear any speech.");
  return Response.json({ text: text.slice(0, MAX_TRANSCRIPT_CHARS) });
}
