import { and, asc, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { formatRoster, ROSTER_MAX } from "./roster";

async function loadPeople() {
  return db
    .select({ id: users.id, name: users.name, username: users.username, role: users.role })
    .from(users)
    .where(and(ne(users.role, "ceo"), sql`coalesce(${users.banned}, false) = false`))
    .orderBy(asc(users.name))
    .limit(ROSTER_MAX);
}

/** Active employees and content writers the CEO can assign a task to, as prompt text. */
export async function loadRosterText(): Promise<string> {
  const people = await loadPeople();
  return formatRoster(people.map((p) => ({ ...p, username: p.username ?? "" })));
}

/** The same people, as plain names: hints for speech recognition so a spoken name is spelled as in the team list. */
export async function loadRosterNames(): Promise<string[]> {
  return (await loadPeople()).map((p) => p.name);
}
