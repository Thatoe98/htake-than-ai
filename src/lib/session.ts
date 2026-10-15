import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { isCeo } from "./permissions";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Signed-in, not banned, onboarding finished. Redirects otherwise. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  const u = session.user;
  if (u.banned) redirect("/login");
  if (u.mustChangePassword || !u.noticeAcceptedAt) redirect("/onboarding");
  return session.user;
}

/** Same as requireUser but only for the CEO. Use at the top of every CEO-only page or action. */
export async function requireCeo() {
  const user = await requireUser();
  if (!isCeo({ id: user.id, role: user.role })) redirect("/");
  return user;
}
