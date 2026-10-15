import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { computeCostUsd, getPrices } from "@/lib/ai/cost";
import { chatModel, hasOpenAIKey, MODEL_IDS } from "@/lib/ai/models";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { buildTools, TOOL_APPROVAL } from "@/lib/ai/tools";
import {
  getOrCreateConversation,
  latestUserMessageId,
  loadMessages,
  saveAssistantMessage,
  saveUserMessage,
  updateAssistantParts,
} from "@/lib/chat-store";
import { isApprovalOnlyUpdate, messageText, startAtUserTurn } from "@/lib/chat-utils";
import { asLocale } from "@/lib/i18n";
import { canAssignTasks, canDraftPosts } from "@/lib/permissions";
import { loadRosterText } from "@/lib/ai/roster-data";
import { createLimiter } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { getMonthlyCapUsd, getMonthSpendUsd, getTimezone } from "@/lib/settings";

export const maxDuration = 60;

const HISTORY_LIMIT = 40; // messages sent to the model; keeps cost and latency down
const limiter = createLimiter({ max: 20, windowMs: 60_000 }); // chat rate limit per user (section 9)
const MAX_MESSAGE_CHARS = 4000; // a pasted wall of text would otherwise burn the AI budget

const body = z.object({ message: z.looseObject({ id: z.string().min(1), role: z.enum(["user", "assistant"]) }) });

const json = (status: number, error: string, extra?: Record<string, string>) =>
  Response.json({ error }, { status, headers: extra });

export async function POST(req: Request) {
  // Auth and role checks live here, not only in the UI.
  const session = await getSession();
  if (!session) return json(401, "Not signed in.");
  const user = session.user;
  if (user.banned) return json(403, "This account is deactivated.");
  if (user.mustChangePassword || !user.noticeAcceptedAt) return json(403, "Finish first-login setup.");

  const rate = limiter.check(user.id);
  if (!rate.ok) return json(429, "Too many messages. Please wait a moment.", { "retry-after": String(rate.retryAfterSec) });

  if (!hasOpenAIKey()) return json(503, "The AI service is not configured yet.");

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, "Invalid request.");
  let incoming = parsed.data.message as unknown as UIMessage;

  // A user message is plain text only. The client could otherwise send tool parts or files, and
  // whatever is stored here is read by the CEO and sent to the model.
  if (incoming.role === "user") {
    const text = Array.isArray(incoming.parts) ? messageText(incoming.parts) : "";
    if (!text) return json(400, "Invalid request.");
    if (text.length > MAX_MESSAGE_CHARS) return json(413, "That message is too long. Please send it in shorter parts.");
    incoming = { id: incoming.id, role: "user", parts: [{ type: "text", text }] };
  }

  // Hard monthly spending cap (section 9, A-4).
  const tz = await getTimezone();
  const [cap, spent] = await Promise.all([getMonthlyCapUsd(), getMonthSpendUsd(tz)]);
  if (spent >= cap) return json(429, "The monthly AI budget has been reached. Please contact your admin.");

  const conversation = await getOrCreateConversation(user.id);
  const stored = await loadMessages(conversation.id, HISTORY_LIMIT);

  // History comes from the database. The client only supplies its newest message: a new user message,
  // or the assistant message carrying the employee's approve/deny answer (which the SDK verifies by signature).
  let history: UIMessage[];
  if (incoming.role === "user") {
    await saveUserMessage(conversation.id, user.id, incoming);
    history = [...stored.filter((m) => m.id !== incoming.id), incoming];
  } else {
    const original = stored.find((m) => m.id === incoming.id);
    if (!original || !isApprovalOnlyUpdate(original, incoming)) return json(400, "Unknown message.");
    if (!(await updateAssistantParts(conversation.id, incoming))) return json(400, "Unknown message.");
    history = stored.map((m) => (m.id === incoming.id ? incoming : m));
  }

  const sourceMessageId = await latestUserMessageId(conversation.id);
  const tools = buildTools({ user, tz, sourceMessageId });

  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: startAtUserTurn(history), tools });
  } catch (e) {
    console.error("[chat] stored history failed validation, starting from the new message", e);
    messages = incoming.role === "user" ? [incoming] : [];
  }

  // Only the CEO is told who is on the team, and only the CEO gets the assign_task tool (see buildTools).
  const roster = canAssignTasks({ id: user.id, role: user.role }) ? await loadRosterText() : null;

  const result = streamText({
    model: chatModel(),
    system: buildSystemPrompt({
      name: user.name,
      locale: asLocale(user.locale),
      tz,
      now: new Date(),
      canDraftPosts: canDraftPosts({ id: user.id, role: user.role }),
      roster,
    }),
    messages: await convertToModelMessages(messages),
    tools,
    toolApproval: TOOL_APPROVAL,
    experimental_toolApprovalSecret: process.env.TOOL_APPROVAL_SECRET || process.env.BETTER_AUTH_SECRET,
    stopWhen: isStepCount(6),
    onError: ({ error }) => console.error("[chat] model error", error),
  });

  // Finish and store the reply even if the phone loses signal mid-stream.
  result.consumeStream();

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: messages,
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      onError: () => "The assistant could not answer. Please try again.",
      onEnd: async ({ responseMessage }) => {
        const usage = await result.totalUsage;
        const tokensIn = usage.inputTokens ?? 0;
        const tokensOut = usage.outputTokens ?? 0;
        await saveAssistantMessage({
          conversationId: conversation.id,
          userId: user.id,
          msg: responseMessage,
          model: MODEL_IDS.chat,
          tokensIn,
          tokensOut,
          costUsd: computeCostUsd({ inputTokens: tokensIn, outputTokens: tokensOut }, getPrices()),
        });
      },
    }),
  });
}
