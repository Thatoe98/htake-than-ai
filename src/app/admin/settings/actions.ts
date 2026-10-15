"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { isDeveloper } from "@/lib/developer";
import { requireCeo } from "@/lib/session";
import { getMonthlyCapUsd, getTimezone } from "@/lib/settings";
import { validateSettings } from "@/lib/settings-validate";

export type SettingsState = { error?: string; ok?: string };

async function upsert(key: string, value: unknown) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** A-4: monthly AI spending cap and company timezone. CEO only; every change is audit-logged. */
export async function saveSettings(_: SettingsState, form: FormData): Promise<SettingsState> {
  const actor = await requireCeo();
  const [oldCap, oldTz] = await Promise.all([getMonthlyCapUsd(), getTimezone()]);
  // Only the developer may change the dollar cap; for the CEO the submitted value is ignored.
  const dev = isDeveloper({ role: actor.role, username: actor.username });
  const checked = validateSettings({
    capUsd: dev ? String(form.get("capUsd") ?? "") : String(oldCap),
    timezone: String(form.get("timezone") ?? ""),
  });
  if (!checked.ok) return { error: checked.error };
  const { capUsd, timezone } = checked.value;

  if (dev && capUsd !== oldCap) {
    await upsert("ai_monthly_cap_usd", capUsd);
    await logAudit(actor.id, "settings.ai_cap", `${oldCap} -> ${capUsd}`);
  }
  if (timezone !== oldTz) {
    await upsert("timezone", timezone);
    await logAudit(actor.id, "settings.timezone", `${oldTz} -> ${timezone}`);
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin/usage");
  return { ok: "Saved." };
}
