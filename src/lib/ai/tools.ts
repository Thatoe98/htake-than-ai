import { tool } from "ai";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  chunks,
  dailyReports,
  documents,
  postVersions,
  posts,
  products,
  taskEvents,
  tasks,
  unansweredQuestions,
  users,
  workLogs,
} from "@/db/schema";
import { logAudit } from "../audit";
import { canAssignTasks, canDraftPosts } from "../permissions";
import { validateAssignedTask } from "../task-input";
import { localDate, parseLocalDeadline } from "../time";
import { checkAssignee } from "./roster";
import {
  assignTaskInput,
  createTaskInput,
  draftPostInput,
  logWorkInput,
  noInput,
  searchKnowledgeInput,
  submitReportInput,
  updateTaskInput,
} from "./tool-schemas";

export type ToolContext = {
  user: { id: string; role?: string | null };
  tz: string;
  /** Row id of the user message being answered; work-log items link back to it (E-8). */
  sourceMessageId: string | null;
};

/** Keyword relevance (pg_trgm word similarity) a chunk or product must reach to count as a match (K-6). */
const MATCH_THRESHOLD = 0.35;

export const NOT_FOUND_MESSAGE = "I could not find this in the company documents";

/**
 * Every tool acts only on `ctx.user`, taken from the session on the server, never from model output,
 * so one employee cannot read or change another's data through the assistant.
 */
export function buildTools(ctx: ToolContext) {
  const { user, tz } = ctx;
  const today = () => localDate(new Date(), tz);

  const base = {
    log_work: tool({
      description: "Record work the user finished or is doing. The user confirms before it is saved.",
      inputSchema: logWorkInput,
      execute: async (input) => {
        const [row] = await db
          .insert(workLogs)
          .values({
            userId: user.id,
            date: today(),
            text: input.text,
            forWhom: input.forWhom,
            status: input.status,
            minutesSpent: input.minutesSpent,
            sourceMessageId: ctx.sourceMessageId,
          })
          .returning({ id: workLogs.id });
        return { ok: true, id: row.id };
      },
    }),

    list_my_tasks: tool({
      description: "List the user's open tasks with their ids, status and deadlines.",
      inputSchema: noInput,
      execute: async () => {
        const rows = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.ownerId, user.id), ne(tasks.status, "done")))
          .orderBy(sql`${tasks.deadline} asc nulls last`)
          .limit(50);
        const now = Date.now();
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          deadline: r.deadline ? localDate(r.deadline, tz) : null,
          overdue: r.deadline ? r.deadline.getTime() < now : false,
        }));
      },
    }),

    create_task: tool({
      description: "Add a task for the user. The user confirms before it is saved.",
      inputSchema: createTaskInput,
      execute: async (input) => {
        let deadline: Date | null = null;
        if (input.deadline) {
          deadline = parseLocalDeadline(input.deadline, tz);
          if (!deadline) return { ok: false, error: "Invalid deadline format. Use YYYY-MM-DD." };
        }
        const [row] = await db
          .insert(tasks)
          .values({ title: input.title, ownerId: user.id, assignerId: user.id, deadline, notes: input.notes })
          .returning({ id: tasks.id });
        await db.insert(taskEvents).values({ taskId: row.id, type: "created", byUserId: user.id });
        return { ok: true, id: row.id };
      },
    }),

    update_task: tool({
      description: "Change the status, deadline or notes of one of the user's tasks. The user confirms first.",
      inputSchema: updateTaskInput,
      execute: async (input) => {
        const [task] = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, input.taskId), eq(tasks.ownerId, user.id)));
        if (!task) return { ok: false, error: "Task not found." };

        let deadline: Date | undefined;
        if (input.deadline) {
          const d = parseLocalDeadline(input.deadline, tz);
          if (!d) return { ok: false, error: "Invalid deadline format. Use YYYY-MM-DD." };
          deadline = d;
        }
        await db
          .update(tasks)
          .set({
            ...(input.status ? { status: input.status } : {}),
            ...(deadline ? { deadline } : {}),
            ...(input.notes ? { notes: task.notes ? `${task.notes}\n${input.notes}` : input.notes } : {}),
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, task.id));

        const events = [
          ...(input.status && input.status !== task.status
            ? [{ type: "status_changed", data: { from: task.status, to: input.status } }]
            : []),
          ...(deadline ? [{ type: "deadline_changed", data: { to: deadline.toISOString() } }] : []),
          ...(input.notes ? [{ type: "note", data: { text: input.notes } }] : []),
        ];
        if (events.length) {
          await db.insert(taskEvents).values(events.map((e) => ({ taskId: task.id, byUserId: user.id, ...e })));
        }
        return { ok: true, id: task.id };
      },
    }),

    get_today_work: tool({
      description: "The work-log items the user has recorded today. Use before building the end-of-day report.",
      inputSchema: noInput,
      execute: async () => {
        const rows = await db
          .select()
          .from(workLogs)
          .where(and(eq(workLogs.userId, user.id), eq(workLogs.date, today())))
          .orderBy(asc(workLogs.createdAt));
        return rows.map((r) => ({
          text: r.text,
          forWhom: r.forWhom,
          status: r.status,
          minutesSpent: r.minutesSpent,
        }));
      },
    }),

    submit_daily_report: tool({
      description: "File today's end-of-day report. The user confirms the four parts before it is saved.",
      inputSchema: submitReportInput,
      execute: async (input) => {
        const date = today();
        const [existing] = await db
          .select({ id: dailyReports.id })
          .from(dailyReports)
          .where(and(eq(dailyReports.userId, user.id), eq(dailyReports.date, date)));
        const fields = {
          rawText: input.rawText,
          done: input.done,
          inProgress: input.inProgress,
          blockers: input.blockers,
          tomorrow: input.tomorrow,
        };
        if (existing) {
          // Editing is allowed until midnight and shown as edited (E-13); `date` is always today here.
          await db
            .update(dailyReports)
            .set({ ...fields, editedAt: new Date() })
            .where(eq(dailyReports.id, existing.id));
          return { ok: true, id: existing.id, edited: true };
        }
        const [row] = await db
          .insert(dailyReports)
          .values({ userId: user.id, date, ...fields })
          .returning({ id: dailyReports.id });
        return { ok: true, id: row.id, edited: false };
      },
    }),

    search_company_knowledge: tool({
      description:
        "Search approved company documents and the products table. Answer only from the result and name the source.",
      inputSchema: searchKnowledgeInput,
      execute: async ({ question }) => {
        const q = question.trim();

        // Exact facts such as prices come from the products table, not from text search (K-5).
        const productRows = await db
          .select({ name: products.name, price: products.price, unit: products.unit, notes: products.notes })
          .from(products)
          .where(sql`word_similarity(${products.name}, ${q}) >= ${MATCH_THRESHOLD}`)
          .orderBy(sql`word_similarity(${products.name}, ${q}) desc`)
          .limit(5);

        // Keyword stage of the search. Burmese has no word spaces, so this uses pg_trgm (K-4).
        // The vector half of the hybrid search is added with the knowledge-base ingestion.
        const score = sql<number>`word_similarity(${q}, ${chunks.text})`;
        const chunkRows = await db
          .select({
            document: documents.title,
            version: documents.version,
            heading: chunks.headingPath,
            text: chunks.text,
            score,
          })
          .from(chunks)
          .innerJoin(documents, eq(documents.id, chunks.documentId))
          .where(and(eq(chunks.retired, false), eq(documents.status, "indexed"), sql`${score} >= ${MATCH_THRESHOLD}`))
          .orderBy(desc(score))
          .limit(5);

        if (!productRows.length && !chunkRows.length) {
          await db
            .insert(unansweredQuestions)
            .values({ question: q.toLowerCase(), userId: user.id })
            .onConflictDoUpdate({
              target: unansweredQuestions.question,
              set: { count: sql`${unansweredQuestions.count} + 1`, lastAsked: new Date() },
            });
          return { found: false as const, message: NOT_FOUND_MESSAGE };
        }
        return {
          found: true as const,
          products: productRows,
          passages: chunkRows.map((c) => ({
            source: `${c.document} v${c.version}${c.heading ? ` › ${c.heading}` : ""}`,
            text: c.text.slice(0, 1500),
          })),
        };
      },
    }),
  };

  // Only the CEO is given this tool (below); the permission and the person are checked again at execute time.
  const assignTask = tool({
    description:
      "Assign a task to another person (an employee or the content writer), not to the CEO. Use the id and name from the team list. The CEO confirms before it is saved.",
    inputSchema: assignTaskInput,
    execute: async (input) => {
      if (!canAssignTasks(user)) return { ok: false, error: "Only the CEO can assign tasks." };

      const [person] = await db
        .select({ name: users.name, banned: users.banned })
        .from(users)
        .where(eq(users.id, input.assigneeId));
      const who = checkAssignee({
        actorId: user.id,
        assigneeId: input.assigneeId,
        assigneeName: input.assigneeName,
        person,
      });
      if (!who.ok) return { ok: false, error: who.error };

      const checked = validateAssignedTask(
        { title: input.title, deadline: input.deadline ?? "", notes: input.notes ?? "" },
        tz,
      );
      if (!checked.ok) return { ok: false, error: checked.error };

      const [row] = await db
        .insert(tasks)
        .values({ ...checked.value, ownerId: input.assigneeId, assignerId: user.id })
        .returning({ id: tasks.id });
      await db.insert(taskEvents).values({ taskId: row.id, type: "created", byUserId: user.id });
      await logAudit(user.id, "task.assign", row.id);
      return { ok: true, id: row.id, assignedTo: who.name };
    },
  });

  // Only people who may draft posts get the tool at all (the permission is also enforced here, not just in the prompt).
  const withCeo = canAssignTasks(user) ? { ...base, assign_task: assignTask } : base;
  if (!canDraftPosts(user)) return withCeo;

  return {
    ...withCeo,
    draft_post: tool({
      description:
        "Save a Facebook post draft in the content studio. It is never published without the CEO. The user confirms first.",
      inputSchema: draftPostInput,
      execute: async (input) => {
        const [post] = await db
          .insert(posts)
          .values({
            authorId: user.id,
            status: "draft",
            brief: {
              goal: input.goal,
              topic: input.topic,
              language: input.language,
              tone: input.tone,
              callToAction: input.callToAction,
            },
          })
          .returning({ id: posts.id });
        await db
          .insert(postVersions)
          .values({ postId: post.id, version: 1, text: input.text, authorId: user.id });
        return { ok: true, id: post.id };
      },
    }),
  };
}

/** Every tool that writes data asks the employee first (E-5). Reads run straight away. */
export const TOOL_APPROVAL = {
  log_work: "user-approval",
  create_task: "user-approval",
  assign_task: "user-approval",
  update_task: "user-approval",
  submit_daily_report: "user-approval",
  draft_post: "user-approval",
} as const;
