"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/session";

export type OnboardingState = { error?: string };

/** First login: replace the temporary password and accept the chat-visibility notice (E-3, A-1). */
export async function completeOnboarding(_: OnboardingState, form: FormData): Promise<OnboardingState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (form.get("accept") !== "on") return { error: "Please accept the notice to continue." };
  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== confirm) return { error: "The new passwords do not match." };
  if (next === current) return { error: "Choose a password different from the temporary one." };

  try {
    await auth.api.changePassword({
      headers: await headers(),
      body: { currentPassword: current, newPassword: next, revokeOtherSessions: true },
    });
  } catch {
    return { error: "The temporary password is not correct." };
  }

  await db
    .update(users)
    .set({ mustChangePassword: false, noticeAcceptedAt: new Date() })
    .where(eq(users.id, session.user.id));

  // Not "/": its redirect to /chat is streamed inside <Suspense>, and the client does not follow a
  // redirect that arrives after an action's own redirect response.
  redirect("/chat");
}
