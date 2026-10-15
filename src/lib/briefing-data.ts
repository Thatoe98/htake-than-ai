import { generateText } from "ai";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, briefings, dailyReports, taskEvents, tasks, users } from "@/db/schema";
import { computeCostUsd, getPrices } from "./ai/cost";
import { briefingModel, hasOpenAIKey, MODEL_IDS } from "./ai/models";
import { logAudit } from "./audit";
import { buildBriefing, factsForAi, summaryIsFaithful, toSummaryLines, type Briefing } from "./briefing";
import { type Locale } from "./i18n";
import { getMonthlyCapUsd, getMonthSpendUsd, getTimezone } from "./settings";
import { localDate } from "./time";

const DAY_MS = 86_400_000;

const SYSTEM = (language: string) => `You write the opening lines of a morning briefing for a company CEO.
You get facts as JSON. Write 2 to 4 very short lines in ${language}, one fact per line, saying what needs attention first.
Rules: each line under 15 words; use only names and numbers that are in the facts; do not add numbers, causes or advice; do not rate, rank or judge any person; do not mention scores. Plain text only: no headings, no bullets, no numbering, no markdown.`;

const LANGUAGE: Record<Locale, string> = { my: "Burmese (Unicode)", en: "English" };

/** Gathers the facts from the database, builds the briefing, adds the AI wording, and stores it (one row per date). */
export async function generateBriefing(actorId: string): Promise<Briefing> {
  const tz = await getTimezone();
  const now = new Date();
  const date = localDate(now, tz);
  const yesterday = localDate(new Date(now.getTime() - DAY_MS), tz);
  const windowStart = localDate(new Date(now.getTime() - 3 * DAY_MS), tz);

  const staff = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(sql`${users.role} <> 'ceo' and coalesce(${users.banned}, false) = false`);
  const staffIds = staff.map((s) => s.id);

  const [reportRows, taskRows, doneRows] = await Promise.all([
    db.select().from(dailyReports).where(gte(dailyReports.date, windowStart)),
    db
      .select({
        id: tasks.id,
        ownerId: tasks.ownerId,
        title: tasks.title,
        status: tasks.status,
        deadline: sql<string | null>`to_char(${tasks.deadline} at time zone ${tz}, 'YYYY-MM-DD')`,
        overdue: sql<boolean>`coalesce(${tasks.deadline} < now(), false)`,
      })
      .from(tasks)
      .where(sql`${tasks.status} <> 'done'`),
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(taskEvents)
      .where(
        and(
          eq(taskEvents.type, "status_changed"),
          sql`${taskEvents.data}->>'to' = 'done'`,
          sql`to_char(${taskEvents.at} at time zone ${tz}, 'YYYY-MM-DD') = ${yesterday}`,
        ),
      ),
  ]);

  const briefing = buildBriefing({
    date,
    yesterday,
    staff,
    reports: reportRows.map((r) => ({ userId: r.userId, date: r.date, done: r.done, inProgress: r.inProgress, blockers: r.blockers, resolvedBlockers: r.resolvedBlockers })),
    openTasks: taskRows.filter((t) => staffIds.includes(t.ownerId)),
    tasksDoneYesterday: doneRows[0]?.n ?? 0,
  });

  // The wording is optional: without a key, over the cap, on an error, or if it invents a number, the facts stand alone.
  // It is written once per interface language so the page never mixes languages when the CEO switches.
  if (hasOpenAIKey()) {
    try {
      const [cap, spent] = await Promise.all([getMonthlyCapUsd(), getMonthSpendUsd(tz)]);
      if (spent < cap) {
        const facts = factsForAi(briefing);
        const summary: NonNullable<Briefing["summary"]> = {};
        await Promise.all(
          (["my", "en"] as const).map(async (lang) => {
            const result = await generateText({ model: briefingModel(), system: SYSTEM(LANGUAGE[lang]), prompt: facts });
            const usage = result.totalUsage;
            await db.insert(aiUsage).values({
              userId: actorId,
              feature: "briefing",
              model: MODEL_IDS.briefing,
              tokensIn: usage.inputTokens ?? 0,
              tokensOut: usage.outputTokens ?? 0,
              costUsd: String(computeCostUsd({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }, getPrices())),
            });
            const lines = toSummaryLines(result.text);
            if (lines.length > 0 && summaryIsFaithful(lines.join(" "), facts)) summary[lang] = lines;
          }),
        );
        if (summary.my || summary.en) briefing.summary = summary;
      }
    } catch (e) {
      console.error("[briefing] AI wording failed, showing the facts only", e);
    }
  }

  const sources = briefing.attention.map((a) => a.href);
  await db
    .insert(briefings)
    .values({ date, content: briefing, sources, generatedAt: now })
    .onConflictDoUpdate({ target: briefings.date, set: { content: briefing, sources, generatedAt: now } });
  await logAudit(actorId, "briefing.generate", date);
  return briefing;
}
