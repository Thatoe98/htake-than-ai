"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/session";

/** Switch the UI between Burmese and English for the signed-in user. */
export async function setLocale(locale: string) {
  const user = await requireUser();
  await db.update(users).set({ locale: asLocale(locale) }).where(eq(users.id, user.id));
}
