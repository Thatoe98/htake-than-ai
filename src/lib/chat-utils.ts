import type { UIMessage } from "ai";

/** Plain text of a message, for the `messages.content` column, search and the CEO view. */
export function messageText(parts: UIMessage["parts"]): string {
  return parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

type ToolLike = { type: string; state?: string; input?: unknown; output?: unknown; toolCallId?: string };

/** Compact record of the tools used in a message, stored in `messages.tool_calls`. */
export function extractToolCalls(parts: UIMessage["parts"]) {
  return (parts as ToolLike[])
    .filter((p) => p.type.startsWith("tool-"))
    .map((p) => ({
      name: p.type.slice("tool-".length),
      state: p.state,
      input: p.input,
      output: p.output,
    }));
}

// Postgres jsonb does not keep key order, so compare with sorted keys.
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/**
 * The client sends back the assistant message once the employee answers a confirmation card.
 * Chat history is read by managers, so accept only that answer: every part must be unchanged,
 * except a tool part that was waiting for approval may now show that it was answered.
 */
export function isApprovalOnlyUpdate(stored: UIMessage, incoming: UIMessage): boolean {
  if (stored.role !== "assistant" || incoming.role !== "assistant") return false;
  if (stored.parts.length !== incoming.parts.length) return false;
  return stored.parts.every((s, i) => {
    const n = incoming.parts[i] as ToolLike & Record<string, unknown>;
    const o = s as ToolLike & Record<string, unknown>;
    if (!o.type.startsWith("tool-")) return same(o, n);
    if (n.type !== o.type || n.toolCallId !== o.toolCallId || !same(n.input, o.input)) return false;
    if (n.state === o.state) return same(o, n);
    return o.state === "approval-requested" && n.state === "approval-responded" && !("output" in n);
  });
}

/** Drop leading assistant messages so the model history always starts with a user turn. */
export function startAtUserTurn<T extends { role: string }>(messages: T[]): T[] {
  const i = messages.findIndex((m) => m.role === "user");
  return i <= 0 ? messages : messages.slice(i);
}
