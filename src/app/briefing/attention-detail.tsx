import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateTime } from "@/lib/format";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import { acknowledgeReport, acknowledgeTask, setBlockerResolved } from "@/app/team/[id]/actions";

export type DetailReport = {
  id: string;
  date: string;
  done: string[];
  inProgress: string[];
  blockers: string[];
  resolvedBlockers: string[];
  tomorrow: string[];
  acknowledgedAt: Date | null;
};

export type DetailTask = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "blocked" | "done";
  deadline: Date | null;
  /** Past its deadline and not done, decided by the database clock. */
  late: boolean;
  notes: string | null;
  assignerName: string | null;
  acknowledgedAt: Date | null;
};

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-medium text-muted">{title}</h4>
      <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function AckBar({
  acknowledgedAt,
  action,
  locale,
  tz,
  personHref,
}: {
  acknowledgedAt: Date | null;
  action: () => Promise<void>;
  locale: Locale;
  tz: string;
  personHref: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <form action={action} className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted tabular-nums">
          {acknowledgedAt ? `${t(locale, "dAcked")} · ${formatDateTime(acknowledgedAt, tz)}` : t(locale, "dNotAcked")}
        </span>
        <button className={acknowledgedAt ? "btn min-h-9" : "btn-primary"}>
          {t(locale, acknowledgedAt ? "dUndo" : "dAck")}
        </button>
      </form>
      <Link href={personHref as `/team/${string}`} className="text-sm text-brand-text underline">
        {t(locale, "dOpenPage")}
      </Link>
    </div>
  );
}

/** Modal body for a blocker raised in a report. `blocker` is the text the CEO tapped. */
export function BlockerDetail({
  report,
  blocker,
  personName,
  personId,
  locale,
  tz,
}: {
  report: DetailReport | null;
  blocker: string;
  personName: string;
  personId: string;
  locale: Locale;
  tz: string;
}) {
  if (!report) {
    return (
      <>
        <p className="leading-relaxed">{blocker}</p>
        <p className="text-sm text-muted">{t(locale, "dGone")}</p>
        <Link href={`/team/${personId}`} className="text-sm text-brand-text underline">
          {t(locale, "dOpenPage")}
        </Link>
      </>
    );
  }
  const resolved = report.resolvedBlockers.includes(blocker);
  const others = report.blockers.filter((b) => b !== blocker);
  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3">
        <p className={`leading-relaxed ${resolved ? "text-muted line-through" : ""}`}>{blocker}</p>
        <form action={setBlockerResolved.bind(null, report.id, blocker, !resolved)} className="flex items-center justify-between gap-3">
          <span className={`text-xs ${resolved ? "text-ok" : "text-muted"}`}>{resolved ? t(locale, "dResolved") : ""}</span>
          <button className={resolved ? "btn min-h-9" : "btn-primary"}>{t(locale, resolved ? "dReopen" : "dResolve")}</button>
        </form>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Fact label={t(locale, "dOwner")}>{personName}</Fact>
        <Fact label={t(locale, "dReport")}>
          <span className="tabular-nums">{report.date}</span>
        </Fact>
      </dl>
      <List title={t(locale, "f_blockers")} items={others} />
      <List title={t(locale, "f_done")} items={report.done} />
      <List title={t(locale, "f_inProgress")} items={report.inProgress} />
      <List title={t(locale, "f_tomorrow")} items={report.tomorrow} />
      <AckBar
        acknowledgedAt={report.acknowledgedAt}
        action={acknowledgeReport.bind(null, report.id, !report.acknowledgedAt)}
        locale={locale}
        tz={tz}
        personHref={`/team/${personId}#report-${report.date}`}
      />
    </>
  );
}

/** Modal body for an overdue or blocked task. */
export function TaskDetail({
  task,
  fallbackTitle,
  personName,
  personId,
  locale,
  tz,
}: {
  task: DetailTask | null;
  fallbackTitle: string;
  personName: string;
  personId: string;
  locale: Locale;
  tz: string;
}) {
  if (!task) {
    return (
      <>
        <p className="leading-relaxed">{fallbackTitle}</p>
        <p className="text-sm text-muted">{t(locale, "dGone")}</p>
        <Link href={`/team/${personId}`} className="text-sm text-brand-text underline">
          {t(locale, "dOpenPage")}
        </Link>
      </>
    );
  }
  return (
    <>
      <p className="text-base font-medium leading-relaxed">{task.title}</p>
      <dl className="grid grid-cols-2 gap-3">
        <Fact label={t(locale, "dOwner")}>{personName}</Fact>
        <Fact label={t(locale, "f_status")}>{t(locale, `s_${task.status}` as MessageKey)}</Fact>
        <Fact label={t(locale, "dDue")}>
          {task.deadline ? (
            <span className={`tabular-nums ${task.late ? "text-danger" : ""}`}>{formatDateTime(task.deadline, tz)}</span>
          ) : (
            "—"
          )}
        </Fact>
        {task.assignerName && <Fact label={t(locale, "dAssignedBy")}>{task.assignerName}</Fact>}
      </dl>
      {task.notes && (
        <div>
          <h4 className="text-xs font-medium text-muted">{t(locale, "f_notes")}</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{task.notes}</p>
        </div>
      )}
      <AckBar
        acknowledgedAt={task.acknowledgedAt}
        action={acknowledgeTask.bind(null, task.id, !task.acknowledgedAt)}
        locale={locale}
        tz={tz}
        personHref={`/team/${personId}#task-${task.id}`}
      />
    </>
  );
}
