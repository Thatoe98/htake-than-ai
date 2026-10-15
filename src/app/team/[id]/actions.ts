"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dailyReports, taskEvents, tasks, users, workLogs } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { isUuid } from "@/lib/ids";
import { canAssignTasks } from "@/lib/permissions";
import { requireCeo, requireUser } from "@/lib/session";
import { getTimezone } from "@/lib/settings";
import { validateAssignedTask } from "@/lib/task-input";

export type AssignState = { error?: string; ok?: string };

/** The CEO sets a task for an employee. The permission is checked here, not just in the UI. */
export async function assignTask(ownerId: string, _: AssignState, form: FormData): Promise<AssignState> {
  const actor = await requireUser();
  if (!canAssignTasks({ id: actor.id, role: actor.role })) return { error: "Only the CEO can assign tasks." };
  if (!isUuid(ownerId)) return { error: "Person not found." };
  const [owner] = await db.select({ id: users.id, banned: users.banned }).from(users).where(eq(users.id, ownerId));
  if (!owner || owner.banned) return { error: "Person not found." };

  const checked = validateAssignedTask(
    {
      title: String(form.get("title") ?? ""),
      deadline: String(form.get("deadline") ?? ""),
      notes: String(form.get("notes") ?? ""),
    },
    await getTimezone(),
  );
  if (!checked.ok) return { error: checked.error };

  const [row] = await db
    .insert(tasks)
    .values({ ...checked.value, ownerId, assignerId: actor.id })
    .returning({ id: tasks.id });
  await db.insert(taskEvents).values({ taskId: row.id, type: "created", byUserId: actor.id });
  await logAudit(actor.id, "task.assign", row.id);
  revalidatePath(`/team/${ownerId}`);
  revalidatePath("/tasks");
  return { ok: "Task assigned." };
}

/**
 * The CEO removes an open task from a team member (hard delete). Work items filed against it are kept,
 * only their link to the task is cleared. The title goes into the audit row since the task itself is gone.
 */
export async function removeTask(ownerId: string, taskId: string) {
  const actor = await requireCeo();
  if (!isUuid(ownerId) || !isUuid(taskId)) return;

  const removed = await db.transaction(async (tx) => {
    const [task] = await tx
      .select({ title: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.ownerId, ownerId)));
    if (!task) return null;
    await tx.update(workLogs).set({ taskId: null }).where(eq(workLogs.taskId, taskId));
    await tx.delete(taskEvents).where(eq(taskEvents.taskId, taskId));
    await tx.delete(tasks).where(eq(tasks.id, taskId));
    return task;
  });
  if (!removed) return;

  await logAudit(actor.id, "task.remove", `${taskId} ${removed.title}`.slice(0, 300));
  revalidatePath(`/team/${ownerId}`);
  revalidatePath("/tasks");
  revalidatePath("/briefing");
}

/** The CEO marks a report as read, or takes that back. Checked here, not just in the UI. */
export async function acknowledgeReport(reportId: string, acknowledged: boolean) {
  const actor = await requireCeo();
  if (!isUuid(reportId)) return;
  const [row] = await db
    .update(dailyReports)
    .set(acknowledged ? { acknowledgedAt: new Date(), acknowledgedBy: actor.id } : { acknowledgedAt: null, acknowledgedBy: null })
    .where(eq(dailyReports.id, reportId))
    .returning({ userId: dailyReports.userId });
  if (!row) return;
  await logAudit(actor.id, acknowledged ? "report.acknowledge" : "report.unacknowledge", reportId);
  revalidatePath(`/team/${row.userId}`);
  revalidatePath("/briefing");
}

/** The CEO marks one blocker of a report resolved (or open again). Blockers are matched by their text. */
export async function setBlockerResolved(reportId: string, blocker: string, resolved: boolean) {
  const actor = await requireCeo();
  if (!isUuid(reportId)) return;
  const [report] = await db
    .select({ userId: dailyReports.userId, blockers: dailyReports.blockers, resolved: dailyReports.resolvedBlockers })
    .from(dailyReports)
    .where(eq(dailyReports.id, reportId));
  if (!report || !report.blockers.includes(blocker)) return;
  const next = resolved ? [...new Set([...report.resolved, blocker])] : report.resolved.filter((b) => b !== blocker);
  await db.update(dailyReports).set({ resolvedBlockers: next }).where(eq(dailyReports.id, reportId));
  await logAudit(actor.id, resolved ? "report.blocker_resolve" : "report.blocker_reopen", reportId);
  revalidatePath(`/team/${report.userId}`);
  revalidatePath("/briefing");
}

/** The CEO marks a task from the briefing as seen, or takes that back. */
export async function acknowledgeTask(taskId: string, acknowledged: boolean) {
  const actor = await requireCeo();
  if (!isUuid(taskId)) return;
  const [row] = await db
    .update(tasks)
    .set(acknowledged ? { acknowledgedAt: new Date(), acknowledgedBy: actor.id } : { acknowledgedAt: null, acknowledgedBy: null })
    .where(eq(tasks.id, taskId))
    .returning({ ownerId: tasks.ownerId });
  if (!row) return;
  await logAudit(actor.id, acknowledged ? "task.acknowledge" : "task.unacknowledge", taskId);
  revalidatePath(`/team/${row.ownerId}`);
  revalidatePath("/briefing");
}
