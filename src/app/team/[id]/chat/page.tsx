import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { requireCeo } from "@/lib/session";
import { getTimezone } from "@/lib/settings";

const LIMIT = 200;

type Tool = { name: string; state?: string };

async function PersonChat({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireCeo();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [person] = await db.select({ name: users.name }).from(users).where(eq(users.id, id));
  if (!person) notFound();

  // A-7: every time someone opens another person's chats, it is recorded. Reading your own is not.
  if (viewer.id !== id) await logAudit(viewer.id, "chat.view", id);

  const tz = await getTimezone();
  const rows = await db
    .select({ id: messages.id, role: messages.role, content: messages.content, toolCalls: messages.toolCalls, at: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.userId, id), inArray(messages.role, ["user", "assistant"])))
    .orderBy(desc(messages.createdAt))
    .limit(LIMIT);
  rows.reverse();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 md:py-10">
      <header className="flex flex-col gap-1 border-b border-line pb-4">
        <Link href={`/team/${id}`} className="text-sm text-brand-text underline">
          {person.name}
        </Link>
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Chat history</h1>
        <p className="text-sm text-muted">
          Read-only. Opening this page is recorded in the audit log. Showing the latest {LIMIT} messages at most.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="card p-6 text-center text-sm text-muted">No messages yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((m) => {
            const tools = ((m.toolCalls as Tool[] | null) ?? []).filter((t) => t.state === "output-available");
            const mine = m.role === "user";
            return (
              <li key={m.id} className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    mine ? "bg-brand-soft text-fg" : "card"
                  }`}
                >
                  {m.content || <span className="text-muted">(no text)</span>}
                </div>
                <span className="text-xs text-muted">
                  {mine ? person.name : "Assistant"} · {formatDateTime(m.at, tz)}
                  {tools.length > 0 && ` · saved via ${tools.map((t) => t.name).join(", ")}`}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}

export default function PersonChatPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy="true" />}>
      <PersonChat params={params} />
    </Suspense>
  );
}
