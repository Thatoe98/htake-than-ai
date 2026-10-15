import { Suspense } from "react";
import { asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { tasks, users } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getTimezone } from "@/lib/settings";

const STATUS_LABEL = { todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done" } as const;

// Everyone sees only their own tasks. Changes are made by telling the assistant in chat, which asks first.
async function MyTasks() {
  const me = await requireUser();
  const tz = await getTimezone();
  const assigner = alias(users, "assigner");

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      deadline: tasks.deadline,
      notes: tasks.notes,
      assignedBy: assigner.name,
      assignerId: tasks.assignerId,
      late: sql<boolean>`${tasks.status} <> 'done' and coalesce(${tasks.deadline} < now(), false)`,
    })
    .from(tasks)
    .leftJoin(assigner, eq(assigner.id, tasks.assignerId))
    .where(eq(tasks.ownerId, me.id))
    .orderBy(sql`${tasks.status} = 'done'`, sql`${tasks.deadline} asc nulls last`, asc(tasks.createdAt));

  const open = rows.filter((r) => r.status !== "done");
  const done = rows.filter((r) => r.status === "done");

  const Item = ({ r }: { r: (typeof rows)[number] }) => (
    <li className="flex flex-col gap-1 px-4 py-3 text-sm">
      <span className="font-medium">{r.title}</span>
      <span className={`text-xs ${r.late ? "text-danger" : "text-muted"}`}>
        {STATUS_LABEL[r.status]}
        {r.deadline && ` · due ${formatDateTime(r.deadline, tz)}${r.late ? " (past deadline)" : ""}`}
        {r.assignerId && r.assignerId !== me.id && r.assignedBy && ` · set by ${r.assignedBy}`}
      </span>
      {r.notes && <span className="whitespace-pre-wrap text-xs text-muted">{r.notes}</span>}
    </li>
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 md:py-10">
      <header className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-gradient text-2xl font-semibold md:text-3xl">My tasks</h1>
          <p className="mt-1 text-sm text-muted">To update a task, tell the assistant in chat.</p>
        </div>
      </header>

      <section aria-labelledby="open" className="flex flex-col gap-3">
        <h2 id="open" className="text-base font-semibold">Open ({open.length})</h2>
        {open.length === 0 ? (
          <p className="card p-5 text-sm text-muted">No open tasks.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {open.map((r) => (
              <Item key={r.id} r={r} />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section aria-labelledby="done" className="flex flex-col gap-3">
          <h2 id="done" className="text-base font-semibold">Done ({done.length})</h2>
          <ul className="card divide-y divide-line">
            {done.map((r) => (
              <Item key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy="true" />}>
      <MyTasks />
    </Suspense>
  );
}
