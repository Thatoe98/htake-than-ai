// Validation for the settings form (A-4). Pure, so it can be tested without a database.
export type SettingsInput = { capUsd: string; timezone: string };
export type CheckedSettings = { ok: true; value: { capUsd: number; timezone: string } } | { ok: false; error: string };

export const MAX_CAP_USD = 10_000;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validateSettings(input: SettingsInput): CheckedSettings {
  const capUsd = Number(input.capUsd);
  if (!input.capUsd.trim() || !Number.isFinite(capUsd) || capUsd <= 0) {
    return { ok: false, error: "The monthly cap must be a number above 0." };
  }
  if (capUsd > MAX_CAP_USD) return { ok: false, error: `The monthly cap cannot be above $${MAX_CAP_USD}.` };
  const timezone = input.timezone.trim();
  if (!timezone || !isValidTimezone(timezone)) {
    return { ok: false, error: `"${timezone}" is not a known timezone. Use a name like Asia/Yangon.` };
  }
  return { ok: true, value: { capUsd: Math.round(capUsd * 100) / 100, timezone } };
}
