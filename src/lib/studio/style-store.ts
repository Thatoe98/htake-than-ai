import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contentStyles } from "@/db/schema";
import { type ImageStyle, parseImageStyle, parseWritingStyle, type WritingStyle } from "./schemas";

export type Styles = { writing: WritingStyle; image: ImageStyle };

/** A missing row, or stored JSON that is no longer valid, gives the defaults (field by field). */
export async function loadStyles(userId: string): Promise<Styles> {
  const [row] = await db.select().from(contentStyles).where(eq(contentStyles.userId, userId));
  return { writing: parseWritingStyle(row?.writing), image: parseImageStyle(row?.image) };
}

/** Always writes the given user's own row; the caller passes the signed-in user's id. */
export async function saveStyles(userId: string, styles: Styles): Promise<void> {
  await db
    .insert(contentStyles)
    .values({ userId, writing: styles.writing, image: styles.image })
    .onConflictDoUpdate({
      target: contentStyles.userId,
      set: { writing: styles.writing, image: styles.image, updatedAt: new Date() },
    });
}
