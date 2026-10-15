// All timestamps are stored in UTC; "dates" (work logs, reports) are company-local calendar dates.
export const DEFAULT_TIMEZONE = "Asia/Yangon";

/** Company-local calendar date as YYYY-MM-DD. */
export function localDate(now: Date, tz = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Human-readable local date and time, for prompts. */
export function localDateTime(now: Date, tz = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return `${parts} (${tz})`;
}

/** Offset of `tz` from UTC at the given instant, in minutes (Asia/Yangon is +390). */
function offsetMinutes(at: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/**
 * Turns a company-local "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" into a UTC Date.
 * A bare date means the end of that day (23:59), so "due Friday" is not already overdue on Friday morning.
 * Returns null if the text is not a valid date.
 */
export function parseLocalDeadline(text: string, tz = DEFAULT_TIMEZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const [h, mi] = m[4] === undefined ? [23, 59] : [+m[4], +m[5]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(naive);
  if (check.getUTCMonth() !== mo - 1) return null; // e.g. 31 February
  // Two passes handle zones whose offset changes (daylight saving) near the date.
  let utc = naive - offsetMinutes(new Date(naive), tz) * 60000;
  utc = naive - offsetMinutes(new Date(utc), tz) * 60000;
  return new Date(utc);
}
