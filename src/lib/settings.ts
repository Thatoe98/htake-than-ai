import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, messages, settings } from "@/db/schema";
import { DEFAULT_MONTHLY_CAP_USD } from "./ai/cost";
import { DEFAULT_TIMEZONE } from "./time";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
  return row ? (row.value as T) : fallback;
}

export const getTimezone = () => getSetting<string>("timezone", DEFAULT_TIMEZONE);

export async function getMonthlyCapUsd(): Promise<number> {
  const envCap = Number(process.env.AI_MONTHLY_CAP_USD);
  return getSetting<number>("ai_monthly_cap_usd", envCap > 0 ? envCap : DEFAULT_MONTHLY_CAP_USD);
}

/** AI spend since the start of the current month in the company timezone (A-6): chat replies plus other AI calls. */
export async function getMonthSpendUsd(tz: string): Promise<number> {
  const since = sql`(date_trunc('month', now() at time zone ${tz}) at time zone ${tz})`;
  const [row] = await db
    .select({
      total: sql<string>`coalesce((select sum(${messages.costUsd}) from ${messages} where ${messages.createdAt} >= ${since}), 0)
        + coalesce((select sum(${aiUsage.costUsd}) from ${aiUsage} where ${aiUsage.createdAt} >= ${since}), 0)`,
    })
    .from(sql`(select 1) as one`);
  return Number(row?.total ?? 0);
}
