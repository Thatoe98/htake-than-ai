import Link from "next/link";
import { Suspense } from "react";
import { desc, eq, ne } from "drizzle-orm";
import { AdminHeader } from "@/components/admin-header";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { isDeveloper } from "@/lib/developer";
import { formatDateTime } from "@/lib/format";
import { requireCeo } from "@/lib/session";
import { getTimezone } from "@/lib/settings";

const PAGE_SIZE = 50;

async function AuditLog({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireCeo();
  const dev = isDeveloper({ role: user.role, username: user.username });
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);
  const tz = await getTimezone();

  // One extra row tells us whether a next page exists.
  const rows = await db
    .select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, target: auditLog.target, actor: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    // Spending-cap changes are dollar figures, so only the developer sees them.
    .where(dev ? undefined : ne(auditLog.action, "settings.ai_cap"))
    .orderBy(desc(auditLog.at))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  const hasNext = rows.length > PAGE_SIZE;
  const shown = rows.slice(0, PAGE_SIZE);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:py-10">
      <AdminHeader current="audit" title="Audit log" />
      <p className="text-sm text-muted">
        Account changes, setting changes and every time someone opens another person&apos;s chats. Entries cannot be edited.
        Times are shown in {tz}.
      </p>

      {shown.length === 0 ? (
        <p className="card p-6 text-center text-sm text-muted">Nothing has been recorded yet.</p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
              <time dateTime={r.at.toISOString()} className="shrink-0 text-xs text-muted tabular-nums sm:w-40">
                {formatDateTime(r.at, tz)}
              </time>
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{r.actor ?? "Unknown user"}</span>{" "}
                <code className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs">{r.action}</code>
                {r.target && <span className="break-all text-muted"> · {r.target}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasNext) && (
        <nav aria-label="Pages" className="flex items-center justify-between">
          {page > 1 ? (
            <Link href={`/admin/audit?page=${page - 1}`} className="btn">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted">Page {page}</span>
          {hasNext ? (
            <Link href={`/admin/audit?page=${page + 1}`} className="btn">
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}

export default function AdminAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy="true" />}>
      <AuditLog searchParams={searchParams} />
    </Suspense>
  );
}
