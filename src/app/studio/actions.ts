"use server";

import { generateImage, generateText, Output } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, posts, postVersions } from "@/db/schema";
import { computeCostUsd, getPrices, imageCostUsd } from "@/lib/ai/cost";
import { contentModel, hasOpenAIKey, imageModel, MODEL_IDS } from "@/lib/ai/models";
import { asLocale, type Locale, t } from "@/lib/i18n";
import { canDraftPosts } from "@/lib/permissions";
import { createLimiter } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { getMonthlyCapUsd, getMonthSpendUsd, getTimezone } from "@/lib/settings";
import { captionOutputSchema } from "@/lib/studio/check";
import { produce, produceImage, type StudioDeps } from "@/lib/studio/generate";
import { parseBrief, parseImageStyle, parseWritingStyle, sanitizeFreeText } from "@/lib/studio/schemas";
import { saveStyles } from "@/lib/studio/style-store";

type Picture = { base64: string; mediaType: string };
type Usage = { inputTokens?: number; outputTokens?: number };
type LoggedCall = { kind: "text" | "image"; usage?: Usage };

export type StudioState = {
  error?: string;
  result?: {
    postId: string;
    caption: string;
    hashtags: string[];
    missingFacts: string[];
    warnings: string[];
    imageIdea: string;
    image: Picture | null;
    imageError: string | null;
  };
};

const limiter = createLimiter({ max: 6, windowMs: 60_000 }); // generations per user; each one costs money
const IMAGE_QUALITIES = ["low", "medium", "high"] as const;

function imageQuality() {
  const q = process.env.OPENAI_IMAGE_QUALITY;
  return IMAGE_QUALITIES.find((x) => x === q) ?? "medium";
}

/** Role check, then the checks every paid call needs. Returns an error text, or null when the call may go ahead. */
async function guard(user: Parameters<typeof canDraftPosts>[0], locale: Locale, paid: boolean): Promise<string | null> {
  if (!canDraftPosts({ id: user.id, role: user.role })) return t(locale, "studioDenied");
  if (!paid) return null;
  if (!limiter.check(user.id).ok) return t(locale, "studioBusy");
  if (!hasOpenAIKey()) return t(locale, "studioNoKey");
  const [cap, spent] = await Promise.all([getMonthlyCapUsd(), getMonthSpendUsd(await getTimezone())]);
  if (spent >= cap) return t(locale, "studioCap"); // no amount in the message: only the developer sees dollars
  return null;
}

/** The real model calls. Every finished call is remembered so it can be logged even if a later step fails. */
function realDeps(calls: LoggedCall[]): StudioDeps {
  return {
    async writeCaption({ system, prompt }) {
      const r = await generateText({
        model: contentModel(),
        system,
        prompt,
        output: Output.object({ schema: captionOutputSchema }),
      });
      const usage = { inputTokens: r.totalUsage.inputTokens, outputTokens: r.totalUsage.outputTokens };
      calls.push({ kind: "text", usage });
      return { output: r.output, usage };
    },
    async drawImage({ prompt, size }) {
      const r = await generateImage({
        model: imageModel(),
        prompt,
        size: size as `${number}x${number}`,
        providerOptions: { openai: { quality: imageQuality() } },
      });
      const usage = { inputTokens: r.usage?.inputTokens, outputTokens: r.usage?.outputTokens };
      calls.push({ kind: "image", usage });
      return { base64: r.image.base64, mediaType: r.image.mediaType, usage };
    },
  };
}

async function logUsage(userId: string, calls: LoggedCall[]): Promise<void> {
  if (calls.length === 0) return;
  const prices = getPrices();
  try {
    await db.insert(aiUsage).values(
      calls.map((c) =>
        c.kind === "text"
          ? {
              userId,
              feature: "content_text",
              model: MODEL_IDS.content,
              tokensIn: c.usage?.inputTokens ?? 0,
              tokensOut: c.usage?.outputTokens ?? 0,
              costUsd: String(computeCostUsd(c.usage ?? {}, prices)),
            }
          : {
              userId,
              feature: "content_image",
              model: MODEL_IDS.image,
              tokensIn: c.usage?.inputTokens ?? 0,
              tokensOut: c.usage?.outputTokens ?? 0,
              costUsd: String(imageCostUsd(c.usage)),
            },
      ),
    );
  } catch (e) {
    console.error("[studio] could not log usage", e);
  }
}

/** A new draft, or the next version of the writer's own draft when `postId` is given. The picture is not stored. */
async function saveDraft(
  userId: string,
  postId: string | undefined,
  brief: unknown,
  text: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    let id: string | undefined;
    if (postId) {
      const [own] = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.id, postId), eq(posts.authorId, userId), eq(posts.status, "draft")));
      id = own?.id;
    }
    if (id) {
      const [latest] = await tx
        .select({ n: sql<number>`coalesce(max(${postVersions.version}), 0)` })
        .from(postVersions)
        .where(eq(postVersions.postId, id));
      await tx.insert(postVersions).values({ postId: id, version: Number(latest?.n ?? 0) + 1, text, authorId: userId });
      return id;
    }
    const [post] = await tx.insert(posts).values({ authorId: userId, status: "draft", brief }).returning({ id: posts.id });
    await tx.insert(postVersions).values({ postId: post.id, version: 1, text, authorId: userId });
    return post.id;
  });
}

export async function generatePost(input: {
  brief: unknown;
  style: unknown;
  imageStyle: unknown;
  postId?: string;
}): Promise<StudioState> {
  const user = await requireUser();
  const locale = asLocale(user.locale);
  const blocked = await guard(user, locale, true);
  if (blocked) return { error: blocked };

  const brief = parseBrief(input.brief);
  if (!brief.ok) return { error: brief.error };
  const style = parseWritingStyle(input.style);
  const imageStyle = parseImageStyle(input.imageStyle);

  const calls: LoggedCall[] = [];
  try {
    await saveStyles(user.id, { writing: style, image: imageStyle }).catch((e) =>
      console.error("[studio] could not save styles", e),
    );
    const r = await produce({ style, imageStyle, brief: brief.value }, realDeps(calls));
    if (r.imageError) console.error("[studio] image failed:", r.imageError);

    const text = [r.caption.caption, r.caption.hashtags.join(" ")].filter(Boolean).join("\n\n");
    const postId = await saveDraft(
      user.id,
      typeof input.postId === "string" ? input.postId : undefined,
      brief.value,
      text,
    );
    return {
      result: {
        postId,
        caption: r.caption.caption,
        hashtags: r.caption.hashtags,
        missingFacts: r.caption.missingFacts,
        warnings: r.warnings,
        imageIdea: r.caption.imageIdea,
        image: r.image,
        imageError: r.imageError ? t(locale, "error") : null,
      },
    };
  } catch (e) {
    console.error("[studio] generate failed", e);
    return { error: t(locale, "error") };
  } finally {
    await logUsage(user.id, calls);
  }
}

export async function regenerateImage(input: {
  imageStyle: unknown;
  imageIdea: string;
}): Promise<{ error?: string; image?: Picture; imageError?: string }> {
  const user = await requireUser();
  const locale = asLocale(user.locale);
  const blocked = await guard(user, locale, true);
  if (blocked) return { error: blocked };

  const imageIdea = sanitizeFreeText(typeof input.imageIdea === "string" ? input.imageIdea : "", 600);
  if (!imageIdea) return { error: t(locale, "error") };
  const imageStyle = parseImageStyle(input.imageStyle);

  const calls: LoggedCall[] = [];
  try {
    const r = await produceImage({ imageStyle, imageIdea }, realDeps(calls));
    if (!r.image) {
      console.error("[studio] image failed:", r.imageError);
      return { imageError: t(locale, "error") };
    }
    return { image: r.image };
  } finally {
    await logUsage(user.id, calls);
  }
}

export async function saveStyle(input: { style: unknown; imageStyle: unknown }): Promise<{ error?: string; ok?: true }> {
  const user = await requireUser();
  const locale = asLocale(user.locale);
  const blocked = await guard(user, locale, false);
  if (blocked) return { error: blocked };
  try {
    await saveStyles(user.id, { writing: parseWritingStyle(input.style), image: parseImageStyle(input.imageStyle) });
    return { ok: true };
  } catch (e) {
    console.error("[studio] save style failed", e);
    return { error: t(locale, "error") };
  }
}
