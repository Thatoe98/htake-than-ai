// Display helpers for the admin pages. Timestamps are stored in UTC and shown in the company timezone.
import { DEFAULT_TIMEZONE } from "./time";

export function formatDateTime(at: Date, tz = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

export function formatUsd(value: number): string {
  // Chat messages cost fractions of a cent, so small amounts keep four decimals.
  return `$${value.toFixed(value !== 0 && Math.abs(value) < 1 ? 4 : 2)}`;
}

/** Share of the cap used, as a whole percent clamped to 0..100 (the bar never overflows). */
export function percentOfCap(spent: number, cap: number): number {
  if (!(cap > 0)) return 100;
  return Math.max(0, Math.min(100, Math.round((spent / cap) * 100)));
}
