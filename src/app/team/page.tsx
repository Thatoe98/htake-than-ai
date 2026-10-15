import Link from "next/link";
import { Suspense } from "react";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { requireCeo } from "@/lib/session";
import { getTimezone } from "@/lib/settings";
import { localDate } from "@/lib/time";

// Plain counts only. No scores, rankings or flags (C-11): people are listed A to Z.
async function Team() {
  await requireCeo();
  const tz = await getTimezone();
  const today = localDate(new Date(), tz);

  // Written out in full: inside a subquery Drizzle prints a bare "id", which would bind to the subquery's own table.
  const uid = sql.raw('"users"."id"');
  const people = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      logsToday: sql<number>`(select count(*) from work_logs w where w.user_id = ${uid} and w.date = ${today})`.mapWith(Number),
      reportToday: sql<boolean>`exists (select 1 from daily_reports r where r.user_id = ${uid} and r.date = ${today})`,
      openTasks: sql<number>`(select count(*) from tasks t where t.owner_id = ${uid} and t.status <> 'done')`.mapWith(Number),
      overdue: sql<number>`(select count(*) from tasks t where t.owner_id = ${uid} and t.status <> 'done' and t.deadline < now())`.mapWith(Number),
      lastMessageAt: sql<Date | null>`(select max(m.created_at) from messages m where m.user_id = ${uid} and m.role = 'user')`.mapWith(
        (v) => (v ? new Date(v) : null),
      ),
    })
    .from(users)
    .where(sql`${users.role} in ('employee', 'content_writer') and coalesce(${users.banned}, false) = false`)
    .orderBy(asc(users.name));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:py-10">
      <header className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-gradient text-2xl font-semibold md:text-3xl">Team</h1>
          <p className="mt-1 text-sm text-muted">Today, {today}. Counts come straight from what people filed.</p>
        </div>
      </header>

      {people.length === 0 ? (
        <p className="card p-6 text-center text-sm text-muted">
          No employee or content writer accounts yet. Create them under <Link href="/admin/users" className="text-brand-text underline">Accounts</Link>.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {people.map((p) => (
            <li key={p.id}>
              <Link
                href={`/team/${p.id}`}
                className="card flex flex-col gap-3 p-4 transition-colors duration-150 hover:border-brand"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted">{ROLE_LABEL[p.role as Role] ?? p.role}</span>
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      p.reportToday ? "bg-brand-soft text-brand-text" : "bg-surface-2 text-muted"
                    }`}
                  >
                    {p.reportToday ? "Report filed" : "No report yet"}
                  </span>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Work items today</dt>
                    <dd className="text-lg font-semibold tabular-nums">{p.logsToday}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Open tasks</dt>
                    <dd className="text-lg font-semibold tabular-nums">{p.openTasks}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Past deadline</dt>
                    <dd className="text-lg font-semibold tabular-nums">{p.overdue}</dd>
                  </div>
                </dl>
                <p className="text-xs text-muted">
                  {p.lastMessageAt ? `Last message ${formatDateTime(p.lastMessageAt, tz)}` : "No messages yet"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy="true" />}>
      <Team />
    </Suspense>
  );
}
