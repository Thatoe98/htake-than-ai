"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageKey } from "@/lib/i18n";

export type VoiceState = "idle" | "recording" | "transcribing";

const MAX_SECONDS = 60;
const MIN_SECONDS = 1;
// Chrome and Firefox record webm/ogg; Safari on iPhone records mp4. The server accepts all of them.
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

const pickMime = () =>
  typeof MediaRecorder === "undefined" ? "" : (MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "");

const ERROR_KEYS: Record<string, MessageKey> = {
  too_short: "voiceTooShort",
  no_speech: "voiceNoSpeech",
};

/**
 * Record from the microphone, upload to /api/transcribe, hand the text to `onText`.
 * The audio never leaves memory except for that one upload; nothing is stored in the browser.
 */
export function useVoiceInput(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState(0);
  // A translation key, or a message the server wrote (budget reached, rate limit) that is already readable.
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelled = useRef(false);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  });

  const release = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const fail = useCallback((key: MessageKey, text: string | null = null) => {
    setErrorKey(key);
    setErrorText(text);
    setState("idle");
  }, []);

  const upload = useCallback(
    async (blob: Blob, duration: number) => {
      setState("transcribing");
      try {
        const form = new FormData();
        form.append("audio", blob, "voice");
        form.append("seconds", String(duration));
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string; code?: string };
        if (res.ok && data.text) {
          setState("idle");
          onTextRef.current(data.text);
          return;
        }
        const known = data.code ? ERROR_KEYS[data.code] : undefined;
        if (known) return fail(known);
        // Messages worth showing as written: the monthly budget and the rate limit.
        if (data.code === "cap" || data.code === "rate") return fail("voiceFailed", data.error ?? null);
        fail("voiceFailed");
      } catch {
        fail("voiceFailed");
      }
    },
    [fail],
  );

  const start = useCallback(async () => {
    setErrorKey(null);
    setErrorText(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return fail("voiceUnsupported");

    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return fail("voiceDenied");
    }
    stream.current = media;
    cancelled.current = false;
    chunks.current = [];

    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
    } catch {
      release();
      return fail("voiceUnsupported");
    }
    recorder.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    rec.onstop = () => {
      const duration = (Date.now() - startedAt.current) / 1000;
      release();
      recorder.current = null;
      if (cancelled.current) return setState("idle");
      if (duration < MIN_SECONDS || chunks.current.length === 0) return fail("voiceTooShort");
      void upload(new Blob(chunks.current, { type: rec.mimeType || mime || "audio/webm" }), Math.min(duration, MAX_SECONDS));
    };

    startedAt.current = Date.now();
    setSeconds(0);
    setState("recording");
    rec.start();
    ticker.current = setInterval(() => {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      setSeconds(Math.floor(elapsed));
      if (elapsed >= MAX_SECONDS && rec.state === "recording") rec.stop();
    }, 250);
  }, [fail, release, upload]);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    else setState("idle");
  }, []);

  // Leaving the page must turn the microphone off.
  useEffect(
    () => () => {
      cancelled.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      release();
    },
    [release],
  );

  const clearError = useCallback(() => {
    setErrorKey(null);
    setErrorText(null);
  }, []);

  return { state, seconds, errorKey, errorText, start, stop, cancel, clearError };
}
