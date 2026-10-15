"use server";

import { revalidatePath } from "next/cache";
import { generateBriefing } from "@/lib/briefing-data";
import { asLocale, t } from "@/lib/i18n";
import { canReadBriefing } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export type RefreshState = { error?: string };

/** C-1: make (or remake) today's briefing now. Only the CEO may. */
export async function refreshBriefing(): Promise<RefreshState> {
  const user = await requireUser();
  const locale = asLocale(user.locale);
  if (!canReadBriefing({ id: user.id, role: user.role })) return { error: t(locale, "bDenied") };
  try {
    await generateBriefing(user.id);
  } catch (e) {
    console.error("[briefing] generate failed", e);
    return { error: t(locale, "error") };
  }
  revalidatePath("/briefing");
  return {};
}
