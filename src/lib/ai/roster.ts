// Pure helpers for "the CEO assigns a task to someone by typing their name in chat" (no database access).
import { ROLE_LABEL, type Role } from "../permissions";

export type RosterPerson = { id: string; name: string; username: string; role: string };

/** More than this and the prompt gets long; a small company never gets near it. */
export const ROSTER_MAX = 100;

const roleLabel = (role: string) => ROLE_LABEL[role as Role] ?? role;

/** The people the CEO can assign to, as lines the model matches a typed name (Burmese or English) against. */
export function formatRoster(people: RosterPerson[]): string {
  if (people.length === 0) return "(No one else has an active account yet, so there is no one to assign to.)";
  return people
    .slice(0, ROSTER_MAX)
    .map((p) => `- ${p.id} | ${p.name} | @${p.username} | ${roleLabel(p.role)}`)
    .join("\n");
}

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

export type AssigneeCheck = { ok: true; name: string } | { ok: false; error: string };

/**
 * Last line of defence before a task is written: the model proposes an id and a name, the database decides.
 * `person` is the row for `assigneeId`, or undefined when there is none.
 */
export function checkAssignee(args: {
  actorId: string;
  assigneeId: string;
  assigneeName: string;
  person: { name: string; banned?: boolean | null } | undefined;
}): AssigneeCheck {
  if (args.assigneeId === args.actorId) {
    return { ok: false, error: "That is the CEO's own account. Use create_task for the CEO's own tasks." };
  }
  if (!args.person || args.person.banned) return { ok: false, error: "Person not found." };
  if (norm(args.person.name) !== norm(args.assigneeName)) {
    return { ok: false, error: "The name does not match that person. Check the team list and try again." };
  }
  return { ok: true, name: args.person.name };
}
