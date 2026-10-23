"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, DownloadIcon, SparklesIcon } from "@/components/icons";
import { type Locale, type MessageKey, t } from "@/lib/i18n";
import type { ImageStyle, WritingStyle } from "@/lib/studio/schemas";
import { generatePost, regenerateImage, saveStyle, type StudioState } from "./actions";
import { copyText, downloadImage } from "./browser-actions";

type Result = NonNullable<StudioState["result"]>;
type Busy = "post" | "image" | "style" | null;

const GOALS = ["promote", "announce", "educate", "engage"] as const;
const LANGUAGES = ["my", "en", "both"] as const;
const TONES = ["friendly", "professional", "energetic", "trustworthy"] as const;
const LENGTHS = ["short", "medium", "long"] as const;
const EMOJIS = ["none", "light", "lots"] as const;
const HASHTAGS = ["off", "few"] as const;
const PRESETS = ["product_photo", "lifestyle", "minimal_studio", "bold_promo"] as const;
const MOODS = ["bright", "warm", "cool_tech", "dark_premium"] as const;
const ASPECTS = ["square", "portrait"] as const;

export function StudioClient({
  locale,
  initialWriting,
  initialImage,
}: {
  locale: Locale;
  initialWriting: WritingStyle;
  initialImage: ImageStyle;
}) {
  const L = (key: string) => t(locale, key as MessageKey);

  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState<(typeof GOALS)[number]>("promote");
  const [facts, setFacts] = useState("");
  const [cta, setCta] = useState("");
  const [writing, setWriting] = useState(initialWriting);
  const [image, setImage] = useState(initialImage);

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [result, setResult] = useState<Result | undefined>();
  const [captionText, setCaptionText] = useState("");

  async function run(kind: Exclude<Busy, null>, work: () => Promise<void>) {
    setBusy(kind);
    setError(undefined);
    setNotice(undefined);
    try {
      await work();
    } catch (e) {
      console.error("[studio]", e);
      setError(t(locale, "error"));
    } finally {
      setBusy(null);
    }
  }

  const brief = { topic, goal, facts, cta };

  function create(postId?: string) {
    return run("post", async () => {
      const r = await generatePost({ brief, style: writing, imageStyle: image, postId });
      if (r.error || !r.result) {
        setError(r.error ?? t(locale, "error"));
        return;
      }
      setResult(r.result);
      setCaptionText(r.result.caption);
    });
  }

  function newPicture() {
    if (!result) return;
    return run("image", async () => {
      const r = await regenerateImage({ imageStyle: image, imageIdea: result.imageIdea });
      if (r.error || r.imageError || !r.image) {
        setError(r.error ?? r.imageError ?? t(locale, "error"));
        return;
      }
      setResult({ ...result, image: r.image, imageError: null });
    });
  }

  function saveMyStyle() {
    return run("style", async () => {
      const r = await saveStyle({ style: writing, imageStyle: image });
      if (r.error) setError(r.error);
      else setNotice(t(locale, "st_styleSaved"));
    });
  }

  async function copyPost() {
    const text = [captionText.trim(), (result?.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n");
    setError(undefined);
    if (await copyText(text)) setNotice(t(locale, "st_copied"));
    else setError(t(locale, "st_copyFailed"));
  }

  const working = busy !== null;
  const canCreate = topic.trim().length > 0 && !working;

  const select = <K extends string>(
    id: string,
    label: string,
    options: readonly K[],
    value: K,
    onChange: (v: K) => void,
    prefix: string,
  ) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value as K)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {L(`${prefix}${o}`)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:py-10">
      <header className="border-b border-line pb-4">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">{t(locale, "studioTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t(locale, "studioIntro")}</p>
      </header>

      <form
        className="card flex flex-col gap-4 p-4 md:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canCreate) void create(); // a new post; only "New text" adds a version to the current draft
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="st-topic" className="text-sm font-medium">
            {t(locale, "st_topic")}
          </label>
          <input
            id="st-topic"
            className="field"
            value={topic}
            maxLength={200}
            placeholder={t(locale, "st_topicHint")}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>

        {select("st-goal", t(locale, "st_goal"), GOALS, goal, setGoal, "goal_")}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="st-facts" className="text-sm font-medium">
            {t(locale, "st_facts")}
          </label>
          <textarea
            id="st-facts"
            className="field min-h-24"
            value={facts}
            maxLength={800}
            onChange={(e) => setFacts(e.target.value)}
            aria-describedby="st-facts-hint"
          />
          <p id="st-facts-hint" className="text-xs text-muted">
            {t(locale, "st_factsHint")}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="st-cta" className="text-sm font-medium">
            {t(locale, "st_cta")}
          </label>
          <input
            id="st-cta"
            className="field"
            value={cta}
            maxLength={120}
            placeholder={t(locale, "st_ctaHint")}
            onChange={(e) => setCta(e.target.value)}
          />
        </div>

        <details className="rounded-xl border border-line px-3.5 py-3">
          <summary className="cursor-pointer select-none text-sm font-medium">{t(locale, "st_style")}</summary>
          <div className="mt-4 flex flex-col gap-5">
            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="mb-1 text-sm font-semibold">{t(locale, "st_writing")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {select("st-lang", t(locale, "f_language"), LANGUAGES, writing.language, (v) => setWriting({ ...writing, language: v }), "lang_")}
                {select("st-tone", t(locale, "f_tone"), TONES, writing.tone, (v) => setWriting({ ...writing, tone: v }), "tone_")}
                {select("st-length", t(locale, "st_length"), LENGTHS, writing.length, (v) => setWriting({ ...writing, length: v }), "len_")}
                {select("st-emoji", t(locale, "st_emoji"), EMOJIS, writing.emoji, (v) => setWriting({ ...writing, emoji: v }), "emoji_")}
                {select("st-tags", t(locale, "st_hashtags"), HASHTAGS, writing.hashtags, (v) => setWriting({ ...writing, hashtags: v }), "tags_")}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="st-wextra" className="text-sm font-medium">
                  {t(locale, "st_extraWriting")}
                </label>
                <textarea
                  id="st-wextra"
                  className="field min-h-20"
                  value={writing.extra}
                  maxLength={300}
                  placeholder={t(locale, "st_extraWritingHint")}
                  onChange={(e) => setWriting({ ...writing, extra: e.target.value })}
                />
              </div>
            </fieldset>

            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="mb-1 text-sm font-semibold">{t(locale, "st_picture")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {select("st-preset", t(locale, "st_preset"), PRESETS, image.preset, (v) => setImage({ ...image, preset: v }), "preset_")}
                {select("st-mood", t(locale, "st_mood"), MOODS, image.mood, (v) => setImage({ ...image, mood: v }), "mood_")}
                {select("st-aspect", t(locale, "st_aspect"), ASPECTS, image.aspect, (v) => setImage({ ...image, aspect: v }), "aspect_")}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="st-iextra" className="text-sm font-medium">
                  {t(locale, "st_extraImage")}
                </label>
                <textarea
                  id="st-iextra"
                  className="field min-h-20"
                  value={image.extra}
                  maxLength={200}
                  placeholder={t(locale, "st_extraImageHint")}
                  onChange={(e) => setImage({ ...image, extra: e.target.value })}
                />
              </div>
            </fieldset>

            <div>
              <button type="button" className="btn w-full sm:w-auto" disabled={working} onClick={() => void saveMyStyle()}>
                {t(locale, "st_saveStyle")}
              </button>
            </div>
          </div>
        </details>

        <button type="submit" className="btn-primary w-full sm:w-auto sm:self-start" disabled={!canCreate}>
          <SparklesIcon width={18} height={18} />
          {busy === "post" ? t(locale, "working") : t(locale, "st_generate")}
        </button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-2">
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-brand-text">
            <CheckIcon width={16} height={16} />
            {notice}
          </p>
        )}
      </div>

      {result && (
        <section aria-labelledby="st-result" className="card flex min-w-0 flex-col gap-5 p-4 md:p-5">
          <div className="flex flex-col gap-1">
            <h2 id="st-result" className="text-base font-semibold">
              {t(locale, "st_caption")}
            </h2>
            <p className="text-xs text-muted">{t(locale, "st_aiNote")}</p>
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
              <p className="font-medium text-danger">{t(locale, "st_warnings")}</p>
              <ul className="mt-1 list-disc pl-5">
                {result.warnings.map((w) => (
                  <li key={w} className="break-words">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="st-caption" className="sr-only">
              {t(locale, "st_caption")}
            </label>
            <textarea
              id="st-caption"
              className="field min-h-48 whitespace-pre-wrap leading-relaxed"
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              aria-describedby="st-caption-hint"
            />
            <p id="st-caption-hint" className="text-xs text-muted">
              {t(locale, "st_captionHint")}
            </p>
          </div>

          {result.hashtags.length > 0 && (
            <p className="break-words text-sm text-brand-text">{result.hashtags.join(" ")}</p>
          )}

          {result.missingFacts.length > 0 && (
            <div className="rounded-xl bg-brand-soft p-3 text-sm">
              <p className="font-medium">{t(locale, "st_missing")}</p>
              <ul className="mt-1 list-disc pl-5">
                {result.missingFacts.map((f) => (
                  <li key={f} className="break-words">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn w-full sm:w-auto" onClick={() => void copyPost()}>
              <CopyIcon width={16} height={16} />
              {t(locale, "st_copy")}
            </button>
            <button type="button" className="btn w-full sm:w-auto" disabled={working} onClick={() => void create(result.postId)}>
              {busy === "post" ? t(locale, "working") : t(locale, "st_regenCaption")}
            </button>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            {result.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:${result.image.mediaType};base64,${result.image.base64}`}
                alt={result.imageIdea}
                className="h-auto w-full max-w-md self-center rounded-2xl border border-line"
              />
            ) : (
              <p className="text-sm text-muted">{result.imageError ?? t(locale, "st_noImage")}</p>
            )}
            {busy === "image" && <p className="text-sm text-muted">{t(locale, "st_imageWorking")}</p>}
            <div className="flex flex-wrap gap-2">
              {result.image && (
                <button
                  type="button"
                  className="btn w-full sm:w-auto"
                  onClick={() => downloadImage(result.image!.base64, result.image!.mediaType, "post-picture")}
                >
                  <DownloadIcon width={16} height={16} />
                  {t(locale, "st_download")}
                </button>
              )}
              <button type="button" className="btn w-full sm:w-auto" disabled={working} onClick={() => void newPicture()}>
                {result.image ? t(locale, "st_regenImage") : t(locale, "st_tryImage")}
              </button>
            </div>
          </div>

          <p className="text-xs text-muted">{t(locale, "st_draftSaved")}</p>
        </section>
      )}
    </main>
  );
}
