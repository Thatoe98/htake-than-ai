// Three roles in v1:
//  - "ceo": the CEO / admin. Can do everything (accounts, settings, team pages, briefing, assign tasks, draft and publish posts).
//  - "content_writer": chats, files reports, and drafts Facebook posts. Nothing else.
//  - "employee": chats, files work logs and reports, sees tasks the CEO assigned. Sees only their own data.

export const ROLES = ["ceo", "content_writer", "employee"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  ceo: "CEO / admin",
  content_writer: "Content writer",
  employee: "Employee",
};

export type Actor = {
  id: string;
  role?: string | null;
};

export const isCeo = (a: Actor) => a.role === "ceo";

/** Create/edit/deactivate accounts, settings, Facebook connection, audit log, usage. */
export const canManageAccounts = isCeo;

/** Open any employee's page, reports, work log, tasks and full chat history. */
export const canViewEmployee = (a: Actor, employeeId: string) => isCeo(a) || a.id === employeeId;

/** Assign tasks to other people. */
export const canAssignTasks = isCeo;

/** Ask the assistant to write Facebook post drafts. */
export const canDraftPosts = (a: Actor) => isCeo(a) || a.role === "content_writer";

/** Approve, request revision, publish or schedule a post. */
export const canApprovePosts = isCeo;

/** Upload and edit knowledge documents and the products table. */
export const canManageKnowledge = isCeo;

/** Read the CEO morning briefing. */
export const canReadBriefing = isCeo;
