// CEO morning briefing (C-1..C-3). Every number and every point is built here from database rows;
// the AI only adds a short wording on top, and that wording is dropped if it contains a number that is not in the facts.
// No scores, rankings or flags about people (C-11): people are listed A to Z and items grouped by kind.

export type StaffRef = { id: string; name: string };
export type ReportRow = {
  userId: string;
  date: string;
  done: string[];
  inProgress: string[];
  blockers: string[];
  /** Blockers the CEO marked resolved; they no longer need attention. */
  resolvedBlockers?: string[];
};
export type OpenTaskRow = {
  id: string;
  ownerId: string;
  title: string;
  status: "todo" | "in_progress" | "blocked" | "done";
  /** Company-local due date, YYYY-MM-DD. */
  deadline: string | null;
  overdue: boolean;
};

export type BriefingInput = {
  /** The briefing day (company-local), and the day before it, whose reports are summarised. */
  date: string;
  yesterday: string;
  /** Reports dated from three days back up to the briefing day. */
  reports: ReportRow[];
  staff: StaffRef[];
  openTasks: OpenTaskRow[];
  tasksDoneYesterday: number;
};

export type AttentionKind = "blocker" | "overdue" | "blocked_task";

export type AttentionItem = {
  kind: AttentionKind;
  /** What the employee wrote (a blocker) or the task title, exactly as stored. Never translated. */
  text: string;
  /** A date shown next to the text: the report date for a blocker, the due date for an overdue task. */
  detail: string | null;
  personId: string;
  personName: string;
  /** Where the fact comes from: the report or the task on the person's page (C-3). */
  href: string;
};

export type Briefing = {
  date: string;
  yesterday: string;
  numbers: {
    reportsFiled: number;
    staffCount: number;
    tasksDone: number;
    overdueTasks: number;
    openBlockers: number;
  };
  attention: AttentionItem[];
  notReported: { id: string; name: string; href: string }[];
  highlights: { id: string; name: string; filed: boolean; done: string[]; href: string }[];
  /** Short AI lines around the facts above, one list per interface language. A language is absent when the AI was
   *  skipped or its text failed the number check. */
  summary?: Partial<Record<"my" | "en", string[]>>;
};

export type AttentionRef = { kind: "report"; userId: string; date: string } | { kind: "task"; taskId: string } | null;

/** Which report or task an attention item points at, read from its href (works for briefings stored earlier too). */
export function attentionRef(item: Pick<AttentionItem, "href" | "personId">): AttentionRef {
  const report = /#report-(\d{4}-\d{2}-\d{2})$/.exec(item.href);
  if (report) return { kind: "report", userId: item.personId, date: report[1] };
  const task = /#task-([0-9a-f-]{36})$/i.exec(item.href);
  if (task) return { kind: "task", taskId: task[1] };
  return null;
}

const byName = (a: StaffRef, b: StaffRef) => a.name.localeCompare(b.name, "en");

export function buildBriefing(input: BriefingInput): Briefing {
  const staff = [...input.staff].sort(byName);
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const isStaff = (id: string) => nameOf.has(id);

  // Open blockers: from each person's latest report in the window, so a blocker raised two days ago still shows.
  const latest = new Map<string, ReportRow>();
  for (const r of input.reports) {
    if (!isStaff(r.userId)) continue;
    const cur = latest.get(r.userId);
    if (!cur || r.date > cur.date) latest.set(r.userId, r);
  }
  const blockers: AttentionItem[] = staff.flatMap((s) => {
    const r = latest.get(s.id);
    const resolved = new Set(r?.resolvedBlockers ?? []);
    return (r?.blockers ?? []).filter((text) => !resolved.has(text)).map((text) => ({
      kind: "blocker" as const,
      text,
      detail: r!.date,
      personId: s.id,
      personName: s.name,
      href: `/team/${s.id}#report-${r!.date}`,
    }));
  });

  const taskItem = (t: OpenTaskRow, kind: AttentionKind): AttentionItem => ({
    kind,
    text: t.title,
    detail: kind === "overdue" ? t.deadline : null,
    personId: t.ownerId,
    personName: nameOf.get(t.ownerId) ?? "",
    href: `/team/${t.ownerId}#task-${t.id}`,
  });
  const open = input.openTasks.filter((t) => t.status !== "done" && isStaff(t.ownerId));
  const overdue = open
    .filter((t) => t.overdue)
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))
    .map((t) => taskItem(t, "overdue"));
  const blockedTasks = open.filter((t) => t.status === "blocked" && !t.overdue).map((t) => taskItem(t, "blocked_task"));

  const filedYesterday = new Set(input.reports.filter((r) => r.date === input.yesterday && isStaff(r.userId)).map((r) => r.userId));
  const reportOf = (id: string) => input.reports.find((r) => r.userId === id && r.date === input.yesterday);

  return {
    date: input.date,
    yesterday: input.yesterday,
    numbers: {
      reportsFiled: filedYesterday.size,
      staffCount: staff.length,
      tasksDone: input.tasksDoneYesterday,
      overdueTasks: overdue.length,
      openBlockers: blockers.length,
    },
    attention: [...blockers, ...overdue, ...blockedTasks],
    notReported: staff.filter((s) => !filedYesterday.has(s.id)).map((s) => ({ id: s.id, name: s.name, href: `/team/${s.id}` })),
    highlights: staff.map((s) => ({
      id: s.id,
      name: s.name,
      filed: filedYesterday.has(s.id),
      done: (reportOf(s.id)?.done ?? []).slice(0, 3),
      href: filedYesterday.has(s.id) ? `/team/${s.id}#report-${input.yesterday}` : `/team/${s.id}`,
    })),
  };
}

// ---- AI wording guard -----------------------------------------------------

const BURMESE_DIGITS = "၀၁၂၃၄၅၆၇၈၉";

/** All whole numbers in a text, with Burmese digits read as ordinary digits. */
export function numbersIn(text: string): string[] {
  const ascii = text.replace(/[၀-၉]/g, (d) => String(BURMESE_DIGITS.indexOf(d)));
  return (ascii.match(/\d+/g) ?? []).map((n) => String(Number(n)));
}

/** The AI text may only repeat numbers that appear in the facts it was given. */
export function summaryIsFaithful(summary: string, facts: string): boolean {
  if (!summary.trim()) return false;
  const allowed = new Set(numbersIn(facts));
  return numbersIn(summary).every((n) => allowed.has(n));
}

/** Splits the model's answer into clean lines (at most four), dropping any bullet marks it added anyway. */
export function toSummaryLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

/** The facts handed to the AI: the same content the page shows, as plain text. */
export function factsForAi(b: Briefing): string {
  return JSON.stringify({
    briefingDate: b.date,
    reportDate: b.yesterday,
    numbers: b.numbers,
    needsAttention: b.attention.map((a) => ({ kind: a.kind, person: a.personName, text: a.text, date: a.detail })),
    didNotReport: b.notReported.map((n) => n.name),
  });
}
