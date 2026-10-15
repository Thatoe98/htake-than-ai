import { db } from "@/db";
import { auditLog } from "@/db/schema";

/** Append-only record of admin actions, role changes and chat access (A-7). */
export async function logAudit(actorId: string, action: string, target?: string) {
  await db.insert(auditLog).values({ actorId, action, target });
}
