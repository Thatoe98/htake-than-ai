import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { briefings, dailyReports, tasks, users } from "@/db/schema";
import {
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  ClipboardCheckIcon,
  ClockIcon,
  FileTextIcon,
  LogoMark,
  SparklesIcon,
} from "@/components/icons";
import { attentionRef, type AttentionItem, type Briefing } from "@/lib/briefing";
import { asLocale, t, type Locale, type MessageKey } from "@/lib/i18n";
import { requireCeo } from "@/lib/session";
import { getTimezone } from "@/lib/settings";
import { localDate } from "@/lib/time";
import { BlockerDetail, TaskDetail, type DetailReport, type DetailTask } from "./attention-detail";
import { DetailDialog } from "./detail-dialog";
import { RefreshButton } from "./refresh-button";

// Status lights: green = fine, amber = worth a look, red = past a deadline. They describe items, never people (C-11).
const TONE = {
  ok: { chip: "bg-ok/10 text-ok", glow: "#22c55e" },
  warn: { chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400", glow: "#f59e0b" },
  danger: { chip: "bg-danger/10 text-danger", glow: "#ef4444" },
} as const;
type Tone = keyof typeof TONE;

const KINDS: { kind: AttentionItem["kind"]; title: MessageKey; tone: Tone; icon: ReactNode }[] = [
  { kind: "blocker", title: "kBlocker", tone: "warn", icon: <AlertTriangleIcon width={18} height={18} /> },
  { kind: "overdue", title: "kOverdue", tone: "danger", icon: <ClockIcon width={18} height={18} /> },
  { kind: "blocked_task", title: "kBlockedTask", tone: "warn", icon: <BanIcon width={18} height={18} /> },
];

// Links come from our own briefing builder and always point at /team/<id>.
const teamHref = (href: string) => href as `/team/${string}`;

const Light = ({ tone }: { tone: Tone }) => (
  <span
    aria-hidden="true"
    className="h-2.5 w-2.5 shrink-0 rounded-full"
    style={{ backgroundColor: TONE[tone].glow, boxShadow: `0 0 8px ${TONE[tone].glow}` }}
  />
);

const Initial = ({ name }: { name: string }) => (
  <span
    aria-hidden="true"
    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-semibold text-white"
  >
    {[...name][0]}
  </span>
);

// "2026-10-13 12:04" in the company timezone. Digits only, so it reads the same in both languages.
const stamp = (at: Date, tz: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(at);

function Numbers({ n, locale }: { n: Briefing["numbers"]; locale: Locale }) {
  const cells: { label: MessageKey; value: string; tone: Tone; icon: ReactNode }[] = [
    {
      label: "nReports",
      value: `${n.reportsFiled}/${n.staffCount}`,
      tone: n.reportsFiled >= n.staffCount ? "ok" : "warn",
      icon: <ClipboardCheckIcon />,
    },
    { label: "nDone", value: String(n.tasksDone), tone: "ok", icon: <CircleCheckIcon /> },
    { label: "nOverdue", value: String(n.overdueTasks), tone: n.overdueTasks > 0 ? "danger" : "ok", icon: <ClockIcon /> },
    { label: "nBlockers", value: String(n.openBlockers), tone: n.openBlockers > 0 ? "warn" : "ok", icon: <AlertTriangleIcon /> },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${TONE[c.tone].chip}`}>{c.icon}</span>
            <Light tone={c.tone} />
          </div>
          <div>
            <dd className="text-3xl font-semibold leading-none tabular-nums">{c.value}</dd>
            <dt className="mt-2 text-sm text-muted">{t(locale, c.label)}</dt>
          </div>
        </div>
      ))}
    </dl>
  );
}

function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: Tone | "plain" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
        tone === "plain" ? "bg-surface-2 text-muted" : TONE[tone].chip
      }`}
    >
      {children}
    </span>
  );
}

async function BriefingView({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireCeo();
  const locale = asLocale(user.locale);
  const { date: requested } = await searchParams;
  const tz = await getTimezone();
  const today = localDate(new Date(), tz);
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;

  const [row] = await db.select().from(briefings).where(eq(briefings.date, date));
  const past = await db.select({ date: briefings.date }).from(briefings).orderBy(desc(briefings.date)).limit(14);
  const b = row ? (row.content as Briefing) : null;
  const lines = b?.summary?.[locale];
  const groups = b
    ? KINDS.map((k) => ({ ...k, items: b.attention.filter((a) => a.kind === k.kind) })).filter((g) => g.items.length > 0)
    : [];

  // The briefing is stored text; what the CEO acts on (acknowledged, resolved) is read live from the report and task rows.
  const refs = (b?.attention ?? []).map((a) => attentionRef(a));
  const reportRefs = refs.filter((r) => r?.kind === "report") as { kind: "report"; userId: string; date: string }[];
  const taskIds = [...new Set(refs.flatMap((r) => (r?.kind === "task" ? [r.taskId] : [])))];
  const reportRows =
    reportRefs.length > 0
      ? await db
          .select()
          .from(dailyReports)
          .where(
            or(...reportRefs.map((r) => and(eq(dailyReports.userId, r.userId), eq(dailyReports.date, r.date)))),
          )
      : [];
  const taskRows =
    taskIds.length > 0
      ? await db
          .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            deadline: tasks.deadline,
            late: sql<boolean>`coalesce(${tasks.deadline} < now() and ${tasks.status} <> 'done', false)`,
            notes: tasks.notes,
            assignerId: tasks.assignerId,
            acknowledgedAt: tasks.acknowledgedAt,
          })
          .from(tasks)
          .where(inArray(tasks.id, taskIds))
      : [];
  const assignerIds = [...new Set(taskRows.flatMap((r) => (r.assignerId ? [r.assignerId] : [])))];
  const assigners =
    assignerIds.length > 0 ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, assignerIds)) : [];
  const assignerName = new Map(assigners.map((u) => [u.id, u.name]));
  const reportBy = new Map<string, DetailReport>(reportRows.map((r) => [`${r.userId}:${r.date}`, r]));
  const taskBy = new Map<string, DetailTask>(
    taskRows.map((r) => [r.id, { ...r, assignerName: r.assignerId ? (assignerName.get(r.assignerId) ?? null) : null }]),
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-gradient text-2xl font-semibold md:text-3xl">{t(locale, "briefing")}</h1>
          <p className="mt-1 text-sm text-muted tabular-nums">
            {date}
            {row && ` · ${t(locale, "bMade")} ${stamp(row.generatedAt, tz)}`}
            {b && ` · ${t(locale, "bReportsFrom")} ${b.yesterday}`}
          </p>
        </div>
      </header>

      {date === today && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">{t(locale, b ? "bRefreshHint" : "bNotMade")}</p>
          <RefreshButton label={t(locale, b ? "bRefresh" : "bMake")} workingLabel={t(locale, "working")} />
        </div>
      )}

      {!b ? (
        date !== today && <p className="card p-6 text-center text-sm text-muted">{t(locale, "bNone")}</p>
      ) : (
        <>
          {lines && lines.length > 0 && (
            <section
              aria-labelledby="summary"
              className="card relative flex flex-col gap-3 overflow-hidden border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-transparent to-indigo-500/10 p-5"
            >
              <div className="flex items-center gap-2.5">
                <LogoMark size={28} />
                <div className="leading-tight">
                  <h2 id="summary" className="text-sm font-semibold">
                    {t(locale, "appName")}
                  </h2>
                  <p className="text-xs text-muted">{t(locale, "bAiNote")}</p>
                </div>
              </div>
              <ul className="flex flex-col gap-2">
                {lines.map((l, i) => (
                  <li key={i} className="flex items-start gap-2.5 leading-relaxed">
                    <SparklesIcon width={16} height={16} className="mt-1.5 shrink-0 text-brand-text" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Numbers n={b.numbers} locale={locale} />

          <section aria-labelledby="attention" className="flex flex-col gap-3">
            <h2 id="attention" className="text-base font-semibold">
              {t(locale, "aTitle")}
            </h2>
            {groups.length === 0 ? (
              <p className="card flex items-center gap-3 p-5 text-sm text-muted">
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${TONE.ok.chip}`}>
                  <CheckIcon />
                </span>
                {t(locale, "aNothing")}
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.kind} className="card overflow-hidden">
                  <h3 className="flex items-center gap-2.5 border-b border-line px-4 py-3 text-sm font-medium">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${TONE[g.tone].chip}`}>{g.icon}</span>
                    {t(locale, g.title)}
                    <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs tabular-nums ${TONE[g.tone].chip}`}>{g.items.length}</span>
                  </h3>
                  <ul className="divide-y divide-line">
                    {g.items.map((a, i) => {
                      const ref = attentionRef(a);
                      const report = ref?.kind === "report" ? (reportBy.get(`${ref.userId}:${ref.date}`) ?? null) : null;
                      const task = ref?.kind === "task" ? (taskBy.get(ref.taskId) ?? null) : null;
                      const resolved = !!report && report.resolvedBlockers.includes(a.text);
                      const acknowledged = !!(report?.acknowledgedAt ?? task?.acknowledgedAt);
                      return (
                        <li key={i} className={resolved ? "opacity-70" : undefined}>
                          <DetailDialog
                            title={t(locale, g.title)}
                            icon={
                              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${TONE[g.tone].chip}`}>{g.icon}</span>
                            }
                            closeLabel={t(locale, "dClose")}
                            trigger={
                              <>
                                <Light tone={resolved ? "ok" : g.tone} />
                                <span className="flex min-w-0 flex-1 flex-col gap-2">
                                  <span className={`leading-relaxed ${resolved ? "line-through" : ""}`}>{a.text}</span>
                                  <span className="flex flex-wrap items-center gap-2">
                                    <Chip>
                                      <Initial name={a.personName} />
                                      {a.personName}
                                    </Chip>
                                    {a.detail && (
                                      <Chip tone={g.tone}>
                                        {g.kind === "overdue" ? <ClockIcon width={13} height={13} /> : <FileTextIcon width={13} height={13} />}
                                        <span className="tabular-nums">
                                          {t(locale, g.kind === "overdue" ? "dDue" : "dReport")} · {a.detail}
                                        </span>
                                      </Chip>
                                    )}
                                    {resolved && (
                                      <Chip tone="ok">
                                        <CheckIcon width={13} height={13} />
                                        {t(locale, "dResolved")}
                                      </Chip>
                                    )}
                                    {acknowledged && !resolved && (
                                      <Chip tone="ok">
                                        <CheckIcon width={13} height={13} />
                                        {t(locale, "dAcked")}
                                      </Chip>
                                    )}
                                  </span>
                                </span>
                                <ChevronRightIcon className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                              </>
                            }
                          >
                            {ref?.kind === "task" ? (
                              <TaskDetail
                                task={task}
                                fallbackTitle={a.text}
                                personName={a.personName}
                                personId={a.personId}
                                locale={locale}
                                tz={tz}
                              />
                            ) : (
                              <BlockerDetail
                                report={report}
                                blocker={a.text}
                                personName={a.personName}
                                personId={a.personId}
                                locale={locale}
                                tz={tz}
                              />
                            )}
                          </DetailDialog>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </section>

          <section aria-labelledby="missing" className="flex flex-col gap-3">
            <h2 id="missing" className="text-base font-semibold">
              {t(locale, "mTitle")} <span className="font-normal text-muted tabular-nums">· {b.yesterday}</span>
            </h2>
            {b.notReported.length === 0 ? (
              <p className="card flex items-center gap-3 p-5 text-sm text-muted">
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${TONE.ok.chip}`}>
                  <CheckIcon />
                </span>
                {t(locale, "mAll")}
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {b.notReported.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={teamHref(p.href)}
                      className="card inline-flex items-center gap-2.5 py-2 pl-2 pr-4 text-sm transition-colors hover:bg-surface-2"
                    >
                      <Initial name={p.name} />
                      {p.name}
                      <Light tone="warn" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="people" className="flex flex-col gap-3">
            <h2 id="people" className="text-base font-semibold">
              {t(locale, "pTitle")} <span className="font-normal text-muted tabular-nums">· {b.yesterday}</span>
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {b.highlights.map((h) => (
                <li key={h.id}>
                  <Link
                    href={teamHref(h.href)}
                    className="card flex h-full flex-col gap-3 p-4 transition-colors hover:bg-surface-2"
                  >
                    <span className="flex items-center gap-3">
                      <Initial name={h.name} />
                      <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
                      <Chip tone={h.filed ? "ok" : "warn"}>
                        {h.filed ? <CheckIcon width={13} height={13} /> : <ClockIcon width={13} height={13} />}
                        {t(locale, h.filed ? "pFiled" : "pNoReport")}
                      </Chip>
                    </span>
                    {h.filed &&
                      (h.done.length > 0 ? (
                        <ul className="flex flex-col gap-1.5 text-sm">
                          {h.done.map((d, i) => (
                            <li key={i} className="flex items-start gap-2 leading-relaxed">
                              <CircleCheckIcon width={16} height={16} className="mt-1 shrink-0 text-ok" />
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted">{t(locale, "pNoDone")}</p>
                      ))}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {past.length > 0 && (
        <nav aria-label={t(locale, "bPast")} className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
          <span className="text-muted">{t(locale, "bPast")}:</span>
          {past.map((p) => (
            <Link
              key={p.date}
              href={{ pathname: "/briefing", query: { date: p.date } }}
              aria-current={p.date === date ? "page" : undefined}
              className={`rounded-full px-3 py-1 tabular-nums ${
                p.date === date ? "bg-brand-soft text-brand-text" : "bg-surface-2 text-muted hover:text-fg"
              }`}
            >
              {p.date}
            </Link>
          ))}
        </nav>
      )}
    </main>
  );
}

export default function BriefingPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy="true" />}>
      <BriefingView searchParams={searchParams} />
    </Suspense>
  );
}
