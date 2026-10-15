import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { tasks, users, workLogs } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { requireCeo } from "@/lib/session";
import { AssignTaskForm } from "./assign-form";
import { RemoveTaskButton } from "./remove-task-button";
import { ReportsSection, type ReportParams } from "./reports-section";
import { getTimezone } from "@/lib/settings";
import { localDate } from "@/lib/time";

const STATUS_LABEL = { todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done" } as const;

async function Person({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ReportParams>;
}) {
  await requireCeo();
  const { id } = await params;
  const query = await searchParams;
  if (!isUuid(id)) notFound();

  const [person] = await db
    .select({ id: users.id, name: users.name, username: users.username, role: users.role })
    .from(users)
    .where(eq(users.id, id));
  if (!person) notFound();

  const tz = await getTimezone();
  const today = localDate(new Date(), tz);
  const [logs, openTasks] = await Promise.all([
    db
      .select()
      .from(workLogs)
      .where(and(eq(workLogs.userId, id), eq(workLogs.date, today)))
      .orderBy(asc(workLogs.createdAt)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        deadline: tasks.deadline,
        late: sql<boolean>`coalesce(${tasks.deadline} < now(), false)`,
      })
      .from(tasks)
      .where(and(eq(tasks.ownerId, id), ne(tasks.status, "done")))
      .orderBy(asc(tasks.deadline)),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:py-10">
      <header className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <Link href="/team" className="text-sm text-brand-text underline">
            Team
          </Link>
          <h1 className="text-gradient truncate text-2xl font-semibold md:text-3xl">{person.name}</h1>
          <p className="text-sm text-muted">@{person.username}</p>
        </div>
        <Link href={`/team/${id}/chat`} className="btn">
          Read chat
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="logs" className="flex flex-col gap-3">
          <h2 id="logs" className="text-base font-semibold">Work filed today ({today})</h2>
          {logs.length === 0 ? (
            <p className="card p-5 text-sm text-muted">Nothing filed today.</p>
          ) : (
            <ul className="card divide-y divide-line">
              {logs.map((l) => (
                <li key={l.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm">
                  <span>{l.text}</span>
                  <span className="text-xs text-muted">
                    {[l.status, l.forWhom && `for ${l.forWhom}`, l.minutesSpent && `${l.minutesSpent} min`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="tasks" className="flex flex-col gap-3">
          <h2 id="tasks" className="text-base font-semibold">Open tasks ({openTasks.length})</h2>
          {openTasks.length === 0 ? (
            <p className="card p-5 text-sm text-muted">No open tasks.</p>
          ) : (
            <ul className="card divide-y divide-line">
              {openTasks.map((t) => (
                <li key={t.id} id={`task-${t.id}`} className="flex scroll-mt-4 flex-col gap-0.5 px-4 py-3 text-sm target:bg-brand-soft">
                  <span>{t.title}</span>
                  <span className={`text-xs ${t.late ? "text-danger" : "text-muted"}`}>
                    {STATUS_LABEL[t.status]}
                    {t.deadline && ` · due ${formatDateTime(t.deadline, tz)}${t.late ? " (past deadline)" : ""}`}
                  </span>
                  <span className="mt-1">
                    <RemoveTaskButton ownerId={id} taskId={t.id} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-2 text-sm font-semibold">Assign a task to {person.name}</h3>
          <AssignTaskForm ownerId={id} />
        </section>
      </div>

      <ReportsSection id={id} tz={tz} today={today} params={query} />
    </main>
  );
}

export default function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ReportParams>;
}) {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy="true" />}>
      <Person params={params} searchParams={searchParams} />
    </Suspense>
  );
}
