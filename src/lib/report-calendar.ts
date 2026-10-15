// Date-range filter and month calendar for the CEO's report view. Pure functions: dates are company-local
// "YYYY-MM-DD" strings, which sort and compare correctly as text.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function isIsoDate(s: string | undefined | null): s is string {
  const m = s ? DATE_RE.exec(s) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function isMonth(s: string | undefined | null): s is string {
  const m = s ? MONTH_RE.exec(s) : null;
  return !!m && +m[2] >= 1 && +m[2] <= 12;
}

export type DateRange = { from?: string; to?: string };

/** Reads ?from and ?to; anything that is not a real date is dropped, and a reversed range is put in order. */
export function parseRange(from?: string, to?: string): DateRange {
  const f = isIsoDate(from) ? from : undefined;
  const t = isIsoDate(to) ? to : undefined;
  if (f && t && f > t) return { from: t, to: f };
  return { from: f, to: t };
}

/** The month in ?month, or the month of `today` when it is missing or invalid. */
export function parseMonth(month: string | undefined, today: string): string {
  return isMonth(month) ? month : today.slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

/** Weeks of the month, Monday first. Cells outside the month are null. */
export function monthGrid(month: string): (string | null)[][] {
  const { start, end } = monthBounds(month);
  const lead = (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const days = +end.slice(8);
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Blockers the CEO has not marked resolved yet. */
export function openBlockers(blockers: string[], resolved: string[]): string[] {
  const done = new Set(resolved);
  return blockers.filter((b) => !done.has(b));
}

export type ReportState = "open_blockers" | "new" | "acknowledged";

/** What a calendar day or list card shows: open blockers first, then not yet acknowledged, then reviewed. */
export function reportState(r: { blockers: string[]; resolvedBlockers: string[]; acknowledgedAt: Date | null }): ReportState {
  if (openBlockers(r.blockers, r.resolvedBlockers).length > 0) return "open_blockers";
  return r.acknowledgedAt ? "acknowledged" : "new";
}
