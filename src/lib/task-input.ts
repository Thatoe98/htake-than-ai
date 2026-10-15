// Pure checks for a task the CEO assigns to someone (no database access).
import { parseLocalDeadline } from "./time";

export const TASK_TITLE_MAX = 200;
export const TASK_NOTES_MAX = 2000;

export type AssignedTask = { title: string; deadline: Date | null; notes: string | null };

export function validateAssignedTask(
  input: { title: string; deadline: string; notes: string },
  tz: string,
): { ok: true; value: AssignedTask } | { ok: false; error: string } {
  const title = input.title.trim();
  const notes = input.notes.trim();
  if (!title) return { ok: false, error: "Enter what the task is." };
  if (title.length > TASK_TITLE_MAX) return { ok: false, error: `The title must be at most ${TASK_TITLE_MAX} characters.` };
  if (notes.length > TASK_NOTES_MAX) return { ok: false, error: `The notes must be at most ${TASK_NOTES_MAX} characters.` };
  let deadline: Date | null = null;
  if (input.deadline.trim()) {
    deadline = parseLocalDeadline(input.deadline, tz);
    if (!deadline) return { ok: false, error: "That deadline is not a valid date." };
  }
  return { ok: true, value: { title, deadline, notes: notes || null } };
}
