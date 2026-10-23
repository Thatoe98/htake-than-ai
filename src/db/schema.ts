import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const vector = (dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType: () => `vector(${dimensions})`,
    toDriver: (v) => `[${v.join(",")}]`,
    fromDriver: (v) => v.slice(1, -1).split(",").map(Number),
  });

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const taskStatusEnum = pgEnum("task_status", ["todo", "in_progress", "blocked", "done"]);
export const conversationKindEnum = pgEnum("conversation_kind", ["assistant", "ceo"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "tool", "system"]);
export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "needs_revision",
  "approved",
  "scheduled",
  "published",
  "failed",
  "archived",
]);
export const documentTypeEnum = pgEnum("document_type", ["sop", "faq", "product", "policy", "other"]);
export const ingestStatusEnum = pgEnum("ingest_status", ["queued", "indexed", "failed"]);

// ---- People ----------------------------------------------------------------

export const teams = pgTable("teams", {
  id: id(),
  name: text("name").notNull(),
  managerId: uuid("manager_id"), // -> users.id (circular; FK added in a migration)
  createdAt: createdAt(),
});

const tz = (name: string) => timestamp(name, { withTimezone: true });

// Better Auth's user table (username + admin plugins) plus our own columns.
// role: "ceo" (CEO + admin) | "content_writer" | "employee". is_approver is unused in v1. Deactivate = banned.
export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(), // synthetic; accounts are username-based
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: tz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  role: text("role").notNull().default("employee"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: tz("ban_expires"),
  teamId: uuid("team_id").references(() => teams.id),
  isApprover: boolean("is_approver").default(false),
  locale: text("locale").default("my"), // "my" | "en"
  mustChangePassword: boolean("must_change_password").default(true),
  noticeAcceptedAt: tz("notice_accepted_at"),
});

export const session = pgTable(
  "session",
  {
    id: id(),
    expiresAt: tz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: tz("updated_at").notNull().$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: tz("access_token_expires_at"),
    refreshTokenExpiresAt: tz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: tz("updated_at").notNull().$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: tz("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: tz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ---- Chat ------------------------------------------------------------------

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    kind: conversationKindEnum("kind").notNull().default("assistant"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversations_user_idx").on(t.userId)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    clientId: text("client_id"), // AI SDK UIMessage id, unique per conversation
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(), // plain text of the message, for search and display
    parts: jsonb("parts"), // full UIMessage parts (text, tool calls, approvals) to rebuild the chat
    toolCalls: jsonb("tool_calls"), // tool name + input + output summary, for the CEO view
    feature: text("feature"), // chat | report | briefing | post | ...
    model: text("model"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    index("messages_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("messages_client_uq").on(t.conversationId, t.clientId),
  ],
);

// AI calls that are not chat messages (briefing, later: weekly summaries). Counted in the spending cap and usage page.
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id),
    feature: text("feature").notNull(), // briefing | summary | ...
    model: text("model").notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);

// ---- Work, reports, tasks --------------------------------------------------

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    title: text("title").notNull(),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    assignerId: uuid("assigner_id").references(() => users.id),
    deadline: timestamp("deadline", { withTimezone: true }),
    status: taskStatusEnum("status").notNull().default("todo"),
    notes: text("notes"),
    links: jsonb("links").$type<string[]>(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // The CEO has seen this task in the briefing ("Needs your attention"); it stays listed until it is done.
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
  },
  (t) => [index("tasks_owner_idx").on(t.ownerId, t.status)],
);

export const taskEvents = pgTable("task_events", {
  id: id(),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  type: text("type").notNull(), // created | status_changed | deadline_changed | note
  byUserId: uuid("by_user_id").references(() => users.id),
  data: jsonb("data"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const workLogs = pgTable(
  "work_logs",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    date: date("date").notNull(), // company-local date
    text: text("text").notNull(),
    forWhom: text("for_whom"),
    status: text("status").notNull().default("done"),
    minutesSpent: integer("minutes_spent"),
    taskId: uuid("task_id").references(() => tasks.id),
    sourceMessageId: uuid("source_message_id").references(() => messages.id),
    createdAt: createdAt(),
  },
  (t) => [index("work_logs_user_date_idx").on(t.userId, t.date)],
);

export const dailyReports = pgTable(
  "daily_reports",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    date: date("date").notNull(),
    rawText: text("raw_text").notNull(),
    done: jsonb("done").$type<string[]>().notNull().default([]),
    inProgress: jsonb("in_progress").$type<string[]>().notNull().default([]),
    blockers: jsonb("blockers").$type<string[]>().notNull().default([]),
    tomorrow: jsonb("tomorrow").$type<string[]>().notNull().default([]),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // The CEO's review of the report. Blockers are matched by their text, so editing the report keeps the rest.
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
    resolvedBlockers: jsonb("resolved_blockers").$type<string[]>().notNull().default([]),
  },
  (t) => [uniqueIndex("daily_reports_user_date_uq").on(t.userId, t.date)],
);

export const briefings = pgTable("briefings", {
  id: id(),
  date: date("date").notNull().unique(),
  content: jsonb("content").notNull(),
  sources: jsonb("sources").notNull().default([]),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dailySummaries = pgTable(
  "daily_summaries",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    date: date("date").notNull(),
    summary: text("summary").notNull(),
    sourceIds: jsonb("source_ids").notNull().default([]),
  },
  (t) => [uniqueIndex("daily_summaries_user_date_uq").on(t.userId, t.date)],
);

export const managerNotes = pgTable("manager_notes", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  date: date("date").notNull(),
  authorId: uuid("author_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  createdAt: createdAt(),
});

// ---- Content studio --------------------------------------------------------

export const posts = pgTable("posts", {
  id: id(),
  status: postStatusEnum("status").notNull().default("draft"),
  authorId: uuid("author_id").notNull().references(() => users.id),
  brief: jsonb("brief"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  fbPostId: text("fb_post_id"),
  permalink: text("permalink"),
  error: text("error"),
  metrics: jsonb("metrics"),
  createdAt: createdAt(),
});

export const postVersions = pgTable(
  "post_versions",
  {
    id: id(),
    postId: uuid("post_id").notNull().references(() => posts.id),
    version: integer("version").notNull(),
    text: text("text").notNull(),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    authorId: uuid("author_id").notNull().references(() => users.id),
    comment: text("comment"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("post_versions_uq").on(t.postId, t.version)],
);

// Each writer's saved writing and image style for the studio (validated on read, so the JSON may be partial).
export const contentStyles = pgTable("content_styles", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  writing: jsonb("writing").notNull().default({}),
  image: jsonb("image").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Knowledge -------------------------------------------------------------

export const documents = pgTable("documents", {
  id: id(),
  title: text("title").notNull(),
  type: documentTypeEnum("type").notNull().default("other"),
  ownerId: uuid("owner_id").references(() => users.id),
  version: integer("version").notNull().default(1),
  status: ingestStatusEnum("status").notNull().default("queued"),
  reviewAt: date("review_at"),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

// The hnsw (vector) and gin (pg_trgm) indexes on chunks are added in a hand-written migration.
export const chunks = pgTable(
  "chunks",
  {
    id: id(),
    documentId: uuid("document_id").notNull().references(() => documents.id),
    headingPath: text("heading_path").notNull().default(""),
    text: text("text").notNull(),
    embedding: vector(1536)("embedding"), // text-embedding-3-small
    retired: boolean("retired").notNull().default(false),
  },
  (t) => [index("chunks_document_idx").on(t.documentId)],
);

export const products = pgTable("products", {
  id: id(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 14, scale: 2 }),
  unit: text("unit"),
  notes: text("notes"),
});

export const unansweredQuestions = pgTable("unanswered_questions", {
  id: id(),
  question: text("question").notNull().unique(),
  userId: uuid("user_id").references(() => users.id),
  count: integer("count").notNull().default(1),
  lastAsked: timestamp("last_asked", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Config and audit ------------------------------------------------------

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    target: text("target"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_at_idx").on(t.at)],
);
