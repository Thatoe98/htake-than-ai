import { and, asc, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { formatRoster, ROSTER_MAX } from "./roster";

/** Active employees and content writers the CEO can assign a task to, as prompt text. */
export async function loadRosterText(): Promise<string> {
  const people = await db
    .select({ id: users.id, name: users.name, username: users.username, role: users.role })
    .from(users)
    .where(and(ne(users.role, "ceo"), sql`coalesce(${users.banned}, false) = false`))
    .orderBy(asc(users.name))
    .limit(ROSTER_MAX);
  return formatRoster(people.map((p) => ({ ...p, username: p.username ?? "" })));
}
