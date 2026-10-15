import { type Locale, type MessageKey, t } from "../i18n";
import {
  assignTaskInput,
  createTaskInput,
  draftPostInput,
  logWorkInput,
  submitReportInput,
  updateTaskInput,
} from "./tool-schemas";

// Tools that write data. The employee must confirm each one (E-5), so the chat shows a card built here.
export const WRITE_TOOLS = [
  "log_work",
  "create_task",
  "assign_task",
  "update_task",
  "submit_daily_report",
  "draft_post",
] as const;
export type WriteTool = (typeof WRITE_TOOLS)[number];
export const isWriteTool = (name: string): name is WriteTool =>
  (WRITE_TOOLS as readonly string[]).includes(name);

export type Summary = { title: string; rows: { label: string; value: string }[] };

const bullets = (items: string[]) => (items.length ? items.map((i) => `• ${i}`).join("\n") : "—");

export function summarizeToolCall(name: string, input: unknown, locale: Locale): Summary | null {
  const L = (k: MessageKey) => t(locale, k);
  const row = (label: MessageKey, value: string | null | undefined) =>
    value ? [{ label: L(label), value }] : [];
  const title = isWriteTool(name) ? L(`tool_${name}`) : name;

  switch (name) {
    case "log_work": {
      const p = logWorkInput.safeParse(input);
      if (!p.success) return null;
      const v = p.data;
      return {
        title,
        rows: [
          ...row("f_what", v.text),
          ...row("f_forWhom", v.forWhom),
          ...row("f_status", L(`s_${v.status}`)),
          ...row("f_time", v.minutesSpent ? `${v.minutesSpent} ${L("minutes")}` : null),
        ],
      };
    }
    case "create_task": {
      const p = createTaskInput.safeParse(input);
      if (!p.success) return null;
      return {
        title,
        rows: [...row("f_title", p.data.title), ...row("f_deadline", p.data.deadline), ...row("f_notes", p.data.notes)],
      };
    }
    case "assign_task": {
      const p = assignTaskInput.safeParse(input);
      if (!p.success) return null;
      return {
        title,
        rows: [
          ...row("f_assignee", p.data.assigneeName),
          ...row("f_title", p.data.title),
          ...row("f_deadline", p.data.deadline),
          ...row("f_notes", p.data.notes),
        ],
      };
    }
    case "update_task": {
      const p = updateTaskInput.safeParse(input);
      if (!p.success) return null;
      return {
        title,
        rows: [
          ...row("f_status", p.data.status ? L(`s_${p.data.status}`) : null),
          ...row("f_deadline", p.data.deadline),
          ...row("f_notes", p.data.notes),
        ],
      };
    }
    case "submit_daily_report": {
      const p = submitReportInput.safeParse(input);
      if (!p.success) return null;
      const v = p.data;
      return {
        title,
        rows: [
          { label: L("f_done"), value: bullets(v.done) },
          { label: L("f_inProgress"), value: bullets(v.inProgress) },
          { label: L("f_blockers"), value: bullets(v.blockers) },
          { label: L("f_tomorrow"), value: bullets(v.tomorrow) },
        ],
      };
    }
    case "draft_post": {
      const p = draftPostInput.safeParse(input);
      if (!p.success) return null;
      const v = p.data;
      return {
        title,
        rows: [
          ...row("f_goal", v.goal),
          ...row("f_topic", v.topic),
          ...row("f_language", L(`lang_${v.language}`)),
          ...row("f_tone", v.tone),
          ...row("f_cta", v.callToAction),
          ...row("f_text", v.text),
        ],
      };
    }
    default:
      return null;
  }
}
