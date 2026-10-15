import Link from "next/link";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { dailyReports } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import {
  monthBounds,
  monthGrid,
  openBlockers,
  parseMonth,
  parseRange,
  reportState,
  shiftMonth,
  type ReportState,
} from "@/lib/report-calendar";
import { acknowledgeReport, setBlockerResolved } from "./actions";

type Report = typeof dailyReports.$inferSelect;
export type ReportParams = { view?: string; from?: string; to?: string; month?: string; status?: string };

const STATE_LABEL: Record<ReportState, string> = {
  open_blockers: "Open blockers",
  new: "Not acknowledged",
  acknowledged: "Acknowledged",
};
const STATE_CLASS: Record<ReportState, string> = {
  open_blockers: "bg-danger/10 text-danger",
  new: "bg-brand-soft text-brand-text",
  acknowledged: "bg-ok/10 text-ok",
};
const DOT_CLASS: Record<ReportState, string> = { open_blockers: "bg-danger", new: "bg-brand", acknowledged: "bg-ok" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LIST_DEFAULT_LIMIT = 14;
const LIST_FILTER_LIMIT = 100;

function href(id: string, p: ReportParams) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  const s = q.toString();
  return `/team/${id}${s ? `?${s}` : ""}`;
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-medium text-muted">{title}</h4>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function ReportCard({ r, tz }: { r: Report; tz: string }) {
  const state = reportState(r);
  const resolved = new Set(r.resolvedBlockers);
  return (
    <li id={`report-${r.date}`} className="card flex scroll-mt-4 flex-col gap-3 p-4 target:ring-2 target:ring-brand-text">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {r.date}
          {r.editedAt && <span className="ml-2 text-xs font-normal text-muted">edited</span>}
        </h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_CLASS[state]}`}>{STATE_LABEL[state]}</span>
      </div>
      <Section title="Done" items={r.done} />
      <Section title="In progress" items={r.inProgress} />
      {r.blockers.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted">Blockers</h4>
          <ul className="mt-1 flex flex-col gap-1.5">
            {r.blockers.map((b, i) => {
              const isResolved = resolved.has(b);
              return (
                <li key={i} className="flex items-start justify-between gap-2 text-sm">
                  <span className={isResolved ? "text-muted line-through" : undefined}>{b}</span>
                  <form action={setBlockerResolved.bind(null, r.id, b, !isResolved)}>
                    <button className="btn min-h-8 px-3 py-1 text-xs">{isResolved ? "Reopen" : "Mark resolved"}</button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <Section title="Tomorrow" items={r.tomorrow} />
      <form
        action={acknowledgeReport.bind(null, r.id, !r.acknowledgedAt)}
        className="flex items-center justify-between gap-2 border-t border-line pt-3"
      >
        <span className="text-xs text-muted">
          {r.acknowledgedAt ? `Acknowledged ${formatDateTime(r.acknowledgedAt, tz)}` : "Not acknowledged yet"}
        </span>
        <button className={r.acknowledgedAt ? "btn min-h-8 px-3 py-1 text-xs" : "btn-primary min-h-9 px-4 py-1.5 text-sm"}>
          {r.acknowledgedAt ? "Undo" : "Acknowledge"}
        </button>
      </form>
    </li>
  );
}

function Calendar({ id, month, today, byDate }: { id: string; month: string; today: string; byDate: Map<string, Report> }) {
  const [y, m] = month.split("-").map(Number);
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
  const nav = (by: number) => href(id, { view: "calendar", month: shiftMonth(month, by) });
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={nav(-1)} className="btn min-h-9 px-3 py-1" aria-label="Previous month">
          ‹
        </Link>
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link href={nav(1)} className="btn min-h-9 px-3 py-1" aria-label="Next month">
          ›
        </Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthGrid(month)
          .flat()
          .map((day, i) => {
            if (!day) return <span key={i} />;
            const r = byDate.get(day);
            const n = Number(day.slice(8));
            const base = `flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm ${
              day === today ? "ring-1 ring-brand-text" : ""
            }`;
            if (!r)
              return (
                <span key={i} className={`${base} text-muted`}>
                  {n}
                </span>
              );
            const state = reportState(r);
            return (
              <Link key={i} href={`#report-${day}`} title={`${day}: ${STATE_LABEL[state]}`} className={`${base} bg-surface-2 hover:bg-brand-soft`}>
                <span>{n}</span>
                <span className={`size-2 rounded-full ${DOT_CLASS[state]}`} aria-hidden="true" />
                <span className="sr-only">{STATE_LABEL[state]}</span>
              </Link>
            );
          })}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(Object.keys(STATE_LABEL) as ReportState[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${DOT_CLASS[s]}`} aria-hidden="true" />
            {STATE_LABEL[s]}
          </span>
        ))}
      </p>
    </div>
  );
}

export async function ReportsSection({ id, tz, today, params }: { id: string; tz: string; today: string; params: ReportParams }) {
  const calendar = params.view === "calendar";
  const month = parseMonth(params.month, today);
  const range = parseRange(params.from, params.to);
  const status = params.status === "new" || params.status === "blockers" ? params.status : "all";

  const bounds = monthBounds(month);
  const where = calendar
    ? and(eq(dailyReports.userId, id), gte(dailyReports.date, bounds.start), lte(dailyReports.date, bounds.end))
    : and(
        eq(dailyReports.userId, id),
        range.from ? gte(dailyReports.date, range.from) : undefined,
        range.to ? lte(dailyReports.date, range.to) : undefined,
      );
  const filtered = !calendar && Boolean(range.from || range.to || status !== "all");
  const rows = await db
    .select()
    .from(dailyReports)
    .where(where)
    .orderBy(desc(dailyReports.date))
    .limit(calendar ? 31 : filtered ? LIST_FILTER_LIMIT : LIST_DEFAULT_LIMIT);

  const reports = calendar
    ? rows
    : rows.filter((r) => {
        if (status === "new") return !r.acknowledgedAt;
        if (status === "blockers") return openBlockers(r.blockers, r.resolvedBlockers).length > 0;
        return true;
      });

  const tab = (isCalendar: boolean, label: string) => (
    <Link
      href={href(id, { view: isCalendar ? "calendar" : undefined })}
      aria-current={isCalendar === calendar ? "page" : undefined}
      className={`btn min-h-9 px-4 py-1 ${isCalendar === calendar ? "border-brand bg-brand-soft text-brand-text" : ""}`}
    >
      {label}
    </Link>
  );

  return (
    <section aria-labelledby="reports" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="reports" className="text-base font-semibold">
          End-of-day reports
        </h2>
        <div className="flex gap-2">
          {tab(false, "List")}
          {tab(true, "Calendar")}
        </div>
      </div>

      {calendar ? (
        <Calendar id={id} month={month} today={today} byDate={new Map(rows.map((r) => [r.date, r]))} />
      ) : (
        <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
          <label className="flex flex-col gap-1 text-xs font-medium">
            From
            <input name="from" type="date" defaultValue={range.from} className="field py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            To
            <input name="to" type="date" defaultValue={range.to} className="field py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Show
            <select name="status" defaultValue={status} className="field py-2 text-sm">
              <option value="all">All reports</option>
              <option value="new">Not acknowledged</option>
              <option value="blockers">Open blockers</option>
            </select>
          </label>
          <button className="btn">Apply</button>
          {filtered && (
            <Link href={`/team/${id}`} className="text-sm text-brand-text underline">
              Clear
            </Link>
          )}
        </form>
      )}

      {reports.length === 0 ? (
        <p className="card p-5 text-sm text-muted">
          {calendar ? "No reports this month." : filtered ? "No reports match these filters." : "No reports filed yet."}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {reports.map((r) => (
            <ReportCard key={r.id} r={r} tz={tz} />
          ))}
        </ul>
      )}
    </section>
  );
}
