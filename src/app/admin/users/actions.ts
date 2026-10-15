"use server";

import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { session, teams, users } from "@/db/schema";
import { accountChangeBlocker, generateTempPassword, validateNewAccount } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { auth, syntheticEmail } from "@/lib/auth";
import { ROLES } from "@/lib/permissions";
import { requireCeo } from "@/lib/session";

export type ActionState = { error?: string; ok?: string; password?: string };

const str = (form: FormData, key: string) => String(form.get(key) ?? "");
const done = () => revalidatePath("/admin/users");

/** A-1: create an account with a temporary password. The person must change it at first login. */
export async function createAccount(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireCeo();
  const checked = validateNewAccount(
    {
      name: str(form, "name"),
      username: str(form, "username"),
      role: str(form, "role"),
      teamId: str(form, "teamId") || null,
      password: str(form, "password"),
    },
    randomInt,
    ROLES,
  );
  if (!checked.ok) return { error: checked.error };
  const a = checked.value;

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, a.username));
  if (taken) return { error: `The username "${a.username}" is already used.` };
  if (a.teamId) {
    const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, a.teamId));
    if (!team) return { error: "That team no longer exists." };
  }

  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    {
      name: a.name,
      email: syntheticEmail(a.username),
      emailVerified: true,
      username: a.username,
      displayUsername: a.username,
      role: a.role,
      teamId: a.teamId,
      mustChangePassword: true,
    },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(a.password),
  });
  await logAudit(actor.id, "user.create", user.id);
  done();
  // Shown once. We store only the hash, so it cannot be shown again.
  return { ok: `Created ${a.name} (${a.username}).`, password: a.password };
}

async function loadTarget(userId: string) {
  const all = await db.select({ id: users.id, role: users.role, banned: users.banned }).from(users);
  return { all, target: all.find((u) => u.id === userId) };
}

/** A-2: deactivate keeps history; the person is signed out everywhere and cannot sign in. */
export async function setActive(userId: string, active: boolean): Promise<ActionState> {
  const actor = await requireCeo();
  const { all, target } = await loadTarget(userId);
  if (!target) return { error: "User not found." };
  if (!active) {
    const blocked = accountChangeBlocker(actor.id, target, { deactivate: true }, all);
    if (blocked) return { error: blocked };
  }
  await db
    .update(users)
    .set({ banned: !active, banReason: active ? null : "Deactivated by the CEO" })
    .where(eq(users.id, userId));
  if (!active) await db.delete(session).where(eq(session.userId, userId));
  await logAudit(actor.id, active ? "user.reactivate" : "user.deactivate", userId);
  done();
  return { ok: active ? "Reactivated." : "Deactivated." };
}

/** A-2: set a new temporary password; the person must change it at next login. */
export async function resetPassword(userId: string): Promise<ActionState> {
  const actor = await requireCeo();
  const { target } = await loadTarget(userId);
  if (!target) return { error: "User not found." };
  const password = generateTempPassword(randomInt);
  const ctx = await auth.$context;
  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(password));
  await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, userId));
  await db.delete(session).where(eq(session.userId, userId));
  await logAudit(actor.id, "user.reset_password", userId);
  done();
  return { ok: "New temporary password set.", password };
}

/** A-2: sign a user out of all devices. */
export async function signOutEverywhere(userId: string): Promise<ActionState> {
  const actor = await requireCeo();
  const { target } = await loadTarget(userId);
  if (!target) return { error: "User not found." };
  await db.delete(session).where(eq(session.userId, userId));
  await logAudit(actor.id, "user.sign_out_all", userId);
  return { ok: "Signed out on all devices." };
}

/** Change team or role. */
export async function updateAccount(userId: string, form: FormData): Promise<ActionState> {
  const actor = await requireCeo();
  const role = str(form, "role");
  const teamId = str(form, "teamId") || null;
  if (!(ROLES as readonly string[]).includes(role)) return { error: "Choose a role." };

  const { all, target } = await loadTarget(userId);
  if (!target) return { error: "User not found." };
  const blocked = accountChangeBlocker(actor.id, target, { newRole: role }, all);
  if (blocked) return { error: blocked };
  if (teamId) {
    const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId));
    if (!team) return { error: "That team no longer exists." };
  }

  await db.update(users).set({ role, teamId }).where(eq(users.id, userId));
  if (role !== target.role) await db.delete(session).where(eq(session.userId, userId));
  await logAudit(actor.id, role !== target.role ? "user.role_change" : "user.update", userId);
  done();
  return { ok: "Saved." };
}

/** A-3: create a team, optionally with a manager (any active CEO). */
export async function createTeam(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireCeo();
  const name = str(form, "name").trim();
  const managerId = str(form, "managerId") || null;
  if (!name) return { error: "Enter a team name." };
  if (name.length > 100) return { error: "The team name is too long." };
  if (managerId) {
    const [m] = await db.select({ role: users.role }).from(users).where(eq(users.id, managerId));
    if (!m || m.role !== "ceo") return { error: "A manager must be the CEO." };
  }
  const [team] = await db.insert(teams).values({ name, managerId }).returning({ id: teams.id });
  await logAudit(actor.id, "team.create", team.id);
  done();
  return { ok: `Team "${name}" created.` };
}
