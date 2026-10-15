import type { UIMessage } from "ai";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { extractToolCalls, messageText } from "./chat-utils";

/** Each employee has one continuing assistant conversation, so "chat all day" stays in one place. */
export async function getOrCreateConversation(userId: string) {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.kind, "assistant")))
    .orderBy(desc(conversations.startedAt))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(conversations).values({ userId, kind: "assistant" }).returning();
  return created;
}

type Row = typeof messages.$inferSelect;

const toUIMessage = (r: Row): UIMessage => ({
  id: r.clientId ?? r.id,
  role: r.role === "assistant" ? "assistant" : "user",
  parts: (r.parts as UIMessage["parts"] | null) ?? [{ type: "text", text: r.content }],
});

/** The most recent `limit` user/assistant messages, oldest first. */
export async function loadMessages(conversationId: string, limit: number): Promise<UIMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), inArray(messages.role, ["user", "assistant"])))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse().map(toUIMessage);
}

/** Stores a user message once (a retried request does not duplicate it). Returns its row id. */
export async function saveUserMessage(conversationId: string, userId: string, msg: UIMessage) {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId,
      userId,
      clientId: msg.id,
      role: "user",
      content: messageText(msg.parts),
      parts: msg.parts,
      feature: "chat",
    })
    .onConflictDoNothing()
    .returning({ id: messages.id });
  if (row) return row.id;
  const [existing] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.clientId, msg.id)));
  return existing?.id ?? null;
}

/** Row id of the latest user message: the source for work-log items made while answering it (E-8). */
export async function latestUserMessageId(conversationId: string) {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Applies the client's updated copy of an assistant message (it carries the employee's approve/deny answer).
 * Returns false if there is no such message in this conversation.
 */
export async function updateAssistantParts(conversationId: string, msg: UIMessage) {
  const updated = await db
    .update(messages)
    .set({ parts: msg.parts, content: messageText(msg.parts), toolCalls: extractToolCalls(msg.parts) })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.clientId, msg.id),
        eq(messages.role, "assistant"),
      ),
    )
    .returning({ id: messages.id });
  return updated.length > 0;
}

/** Inserts the assistant reply, or extends it when a tool approval continued the same message. */
export async function saveAssistantMessage(args: {
  conversationId: string;
  userId: string;
  msg: UIMessage;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}) {
  const { conversationId, userId, msg, model, tokensIn, tokensOut, costUsd } = args;
  const values = {
    conversationId,
    userId,
    clientId: msg.id,
    role: "assistant" as const,
    content: messageText(msg.parts),
    parts: msg.parts,
    toolCalls: extractToolCalls(msg.parts),
    feature: "chat",
    model,
    tokensIn,
    tokensOut,
    costUsd: String(costUsd),
  };
  await db
    .insert(messages)
    .values(values)
    .onConflictDoUpdate({
      target: [messages.conversationId, messages.clientId],
      set: {
        content: values.content,
        parts: values.parts,
        toolCalls: values.toolCalls,
        model,
        tokensIn: sql`coalesce(${messages.tokensIn}, 0) + ${tokensIn}`,
        tokensOut: sql`coalesce(${messages.tokensOut}, 0) + ${tokensOut}`,
        costUsd: sql`coalesce(${messages.costUsd}, 0) + ${costUsd}`,
      },
    });
}
