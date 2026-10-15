import { z } from "zod";

// Optional fields are `.nullable()` (not `.optional()`) because OpenAI's strict JSON-schema mode
// requires every property to be present.

export const workStatus = z.enum(["done", "in_progress", "blocked"]);
export const taskStatus = z.enum(["todo", "in_progress", "blocked", "done"]);

const deadlineText = z
  .string()
  .describe(
    "Company-local date 'YYYY-MM-DD' or date and time 'YYYY-MM-DDTHH:mm'. A bare date means end of that day.",
  );

export const logWorkInput = z.object({
  text: z.string().min(1).max(500).describe("What was done or is in progress, in one clear sentence."),
  forWhom: z.string().max(120).nullable().describe("Client, customer or colleague it was for, or null."),
  status: workStatus,
  minutesSpent: z.number().int().min(1).max(1440).nullable().describe("Minutes spent, or null if not said."),
});

export const createTaskInput = z.object({
  title: z.string().min(1).max(200),
  deadline: deadlineText.nullable(),
  notes: z.string().max(1000).nullable(),
});

/** CEO only: a task for someone else. Id and name both come from the team list in the system prompt. */
export const assignTaskInput = z.object({
  assigneeId: z.string().uuid().describe("Id of the person, copied from the team list."),
  assigneeName: z.string().min(1).max(120).describe("That person's name exactly as written in the team list."),
  title: z.string().min(1).max(200),
  deadline: deadlineText.nullable(),
  notes: z.string().max(1000).nullable(),
});

export const updateTaskInput = z.object({
  taskId: z.string().uuid().describe("Id from list_my_tasks."),
  status: taskStatus.nullable().describe("New status, or null to leave unchanged."),
  deadline: deadlineText.nullable().describe("New deadline, or null to leave unchanged."),
  notes: z.string().max(1000).nullable().describe("Note to add, or null."),
});

export const searchKnowledgeInput = z.object({
  question: z.string().min(1).max(500).describe("The employee's question, as a short search query."),
});

export const draftPostInput = z.object({
  goal: z.string().min(1).max(300),
  topic: z.string().min(1).max(300),
  language: z.enum(["my", "en", "both"]),
  tone: z.string().max(100).nullable(),
  callToAction: z.string().max(200).nullable(),
  text: z.string().min(1).max(3000).describe("The draft Facebook caption, including hashtags."),
});

const lines = z.array(z.string().min(1).max(300)).max(20);

export const submitReportInput = z.object({
  rawText: z.string().min(1).max(4000).describe("The employee's own words, unchanged."),
  done: lines,
  inProgress: lines,
  blockers: lines,
  tomorrow: lines,
});

export const noInput = z.object({});

export type LogWorkInput = z.infer<typeof logWorkInput>;
export type CreateTaskInput = z.infer<typeof createTaskInput>;
export type AssignTaskInput = z.infer<typeof assignTaskInput>;
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;
export type DraftPostInput = z.infer<typeof draftPostInput>;
export type SubmitReportInput = z.infer<typeof submitReportInput>;
