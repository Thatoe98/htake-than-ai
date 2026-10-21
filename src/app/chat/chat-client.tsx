"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpIcon,
  CheckIcon,
  ClipboardCheckIcon,
  EyeIcon,
  FileTextIcon,
  ListTodoIcon,
  LogoMark,
  MicIcon,
  PencilIcon,
  SparklesIcon,
  StopIcon,
  XIcon,
} from "@/components/icons";
import { summarizeToolCall, isWriteTool } from "@/lib/ai/tool-summary";
import { type Locale, type MessageKey, t } from "@/lib/i18n";
import { useVoiceInput } from "./use-voice-input";

type ToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: { ok?: boolean; error?: string } | null;
  approval?: { id: string };
};

const isToolPart = (p: { type: string }): p is ToolPart => p.type.startsWith("tool-");
const toolName = (p: ToolPart) => p.type.slice("tool-".length);

const toolIcon: Record<string, () => ReactNode> = {
  log_work: () => <ClipboardCheckIcon width={18} height={18} />,
  create_task: () => <ListTodoIcon width={18} height={18} />,
  assign_task: () => <ListTodoIcon width={18} height={18} />,
  update_task: () => <ListTodoIcon width={18} height={18} />,
  submit_daily_report: () => <FileTextIcon width={18} height={18} />,
  draft_post: () => <PencilIcon width={18} height={18} />,
};

function serverMessage(error: Error | undefined): string | null {
  if (!error) return null;
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    return parsed.error ?? null;
  } catch {
    return null;
  }
}

function Avatar() {
  return (
    <span
      aria-hidden="true"
      className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 text-brand-text ring-1 ring-violet-500/20"
    >
      <SparklesIcon width={15} height={15} />
    </span>
  );
}

function TypingDots({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="status">
      <Avatar />
      <span className="sr-only">{label}</span>
      <span className="flex items-center gap-1.5 rounded-2xl bg-surface-2 px-4 py-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="typing-dot size-1.5 rounded-full bg-muted"
            style={{ animation: "typing-dot 1.2s ease-in-out infinite", animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
    </div>
  );
}

export function ChatClient({
  initialMessages,
  locale,
  name,
  canDraftPosts,
}: {
  initialMessages: UIMessage[];
  locale: Locale;
  name: string;
  canDraftPosts: boolean;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // The server keeps the history; it only needs the newest message.
        prepareSendMessagesRequest: ({ messages }) => ({ body: { message: messages[messages.length - 1] } }),
      }),
    [],
  );

  const { messages, sendMessage, addToolApprovalResponse, status, error, stop } = useChat({
    id: "assistant",
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const busy = status === "submitted" || status === "streaming";
  const awaitingApproval = messages.some((m) =>
    m.parts.some((p) => isToolPart(p) && (p as unknown as ToolPart).state === "approval-requested"),
  );

  const last = messages[messages.length - 1];
  const lastHasVisibleReply =
    last?.role === "assistant" &&
    last.parts.some(
      (p) => (p.type === "text" && p.text) || (isToolPart(p) && isWriteTool(toolName(p as unknown as ToolPart))),
    );
  const showTyping = status === "submitted" || (status === "streaming" && !lastHasVisibleReply);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  // Grow the box with the text, up to a limit.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || awaitingApproval) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  // A spoken message is sent as soon as it is understood, like a typed one. Nothing is saved without the
  // approval card, so a misheard word can still be corrected before anything is stored.
  const voice = useVoiceInput(send);
  const voiceBusy = voice.state !== "idle";
  const voiceError = voice.errorText ?? (voice.errorKey ? t(locale, voice.errorKey) : null);
  const clock = `${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, "0")}`;

  const renderTool = (p: ToolPart) => {
    const name = toolName(p);
    if (!isWriteTool(name)) return null; // reads (task list, knowledge search) just feed the answer
    const key = p.toolCallId;

    if (p.state === "approval-requested" && p.approval) {
      const summary = summarizeToolCall(name, p.input, locale);
      const approvalId = p.approval.id;
      return (
        <div key={key} className="card w-full max-w-lg overflow-hidden border-brand/40 shadow-sm">
          <div className="flex items-center gap-2 bg-brand-soft px-4 py-2.5 text-sm font-medium text-brand-text">
            {toolIcon[name]?.()}
            {summary?.title ?? name}
          </div>
          <div className="flex flex-col gap-3 p-4 text-sm">
            <p className="text-muted">{t(locale, "willSave")}</p>
            {summary ? (
              <dl className="flex flex-col gap-2">
                {summary.rows.map((r) => (
                  <div key={r.label} className="rounded-xl bg-surface-2 px-3 py-2">
                    <dt className="text-xs text-muted">{r.label}</dt>
                    <dd className="whitespace-pre-wrap break-words">{r.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <pre className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-xs">{JSON.stringify(p.input, null, 2)}</pre>
            )}
            <p className="text-xs text-muted">{t(locale, "correctionHint")}</p>
            <div className="flex gap-2">
              <button
                onClick={() => addToolApprovalResponse({ id: approvalId, approved: true })}
                className="btn-primary flex-1"
              >
                <CheckIcon width={18} height={18} />
                {t(locale, "save")}
              </button>
              <button
                onClick={() => addToolApprovalResponse({ id: approvalId, approved: false })}
                className="btn min-h-11 flex-1 text-base"
              >
                <XIcon width={18} height={18} />
                {t(locale, "dontSave")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    const label = t(locale, `tool_${name}` as MessageKey);
    const pill = "inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium";
    if (p.state === "output-available") {
      const failed = p.output?.ok === false;
      return failed ? (
        <p key={key} className={`${pill} text-danger`}>
          <XIcon width={14} height={14} />
          {t(locale, "failed")}: {label}
        </p>
      ) : (
        <p key={key} className={`${pill} text-ok`}>
          <CheckIcon width={14} height={14} />
          {t(locale, "saved")}: {label}
        </p>
      );
    }
    if (p.state === "output-denied") {
      return (
        <p key={key} className={`${pill} text-muted`}>
          {t(locale, "notSaved")}: {label}
        </p>
      );
    }
    if (p.state === "output-error") {
      return (
        <p key={key} className={`${pill} text-danger`}>
          <XIcon width={14} height={14} />
          {t(locale, "failed")}: {label}
        </p>
      );
    }
    return null;
  };

  const suggestions: { key: MessageKey; icon: ReactNode }[] = [
    { key: "sugLog", icon: <ClipboardCheckIcon width={18} height={18} /> },
    { key: "sugTask", icon: <ListTodoIcon width={18} height={18} /> },
    { key: "sugReport", icon: <FileTextIcon width={18} height={18} /> },
    ...(canDraftPosts ? [{ key: "sugPost" as const, icon: <PencilIcon width={18} height={18} /> }] : []),
  ];

  return (
    <div lang={locale === "my" ? "my" : "en"} className="flex min-h-0 w-full flex-1 flex-col">
      {/* E-3: always visible, never dismissible. */}
      <div className="border-b border-line bg-notice-bg">
        <p className="mx-auto flex w-full max-w-3xl items-start gap-2 px-4 py-2 text-xs text-notice-fg md:text-sm">
          <EyeIcon width={16} height={16} className="mt-0.5 shrink-0" />
          {t(locale, "visibleNotice")}
        </p>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-4 py-5 md:gap-6 md:py-8">
          {messages.length === 0 && (
            <div className="my-auto flex flex-col items-center gap-6 py-6 text-center">
              <LogoMark size={56} />
              <div className="flex flex-col gap-2">
                <h2 className="text-gradient text-3xl font-semibold md:text-4xl">
                  {t(locale, "greeting")} {name}
                </h2>
                <p className="mx-auto max-w-md text-sm text-muted md:text-base">{t(locale, "emptyState")}</p>
              </div>
              <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <button
                    key={s.key}
                    disabled={busy || awaitingApproval}
                    onClick={() => send(t(locale, s.key))}
                    className="card flex min-h-14 items-center gap-3 px-4 py-3 text-left text-sm transition-colors duration-150 hover:border-brand hover:bg-brand-soft disabled:opacity-50"
                  >
                    <span className="text-brand-text">{s.icon}</span>
                    {t(locale, s.key)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="msg-in flex flex-col items-end gap-2">
                  {m.parts.map((p, i) =>
                    p.type === "text" && p.text ? (
                      <div
                        key={`${m.id}-${i}`}
                        className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-surface-2 px-4 py-2.5 text-base md:max-w-[75%]"
                      >
                        {p.text}
                      </div>
                    ) : null,
                  )}
                </div>
              );
            }
            const parts = m.parts
              .map((p, i) => {
                if (p.type === "text") {
                  if (!p.text) return null;
                  return (
                    <div key={`${m.id}-${i}`} className="whitespace-pre-wrap break-words text-base leading-7">
                      {p.text}
                    </div>
                  );
                }
                return isToolPart(p) ? renderTool(p as unknown as ToolPart) : null;
              })
              .filter(Boolean);
            if (parts.length === 0) return null;
            return (
              <div key={m.id} className="msg-in flex items-start gap-3">
                <Avatar />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-2">{parts}</div>
              </div>
            );
          })}

          {showTyping && <TypingDots label={t(locale, "working")} />}
          {error && (
            <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
              {serverMessage(error) ?? t(locale, "error")}
            </p>
          )}
          {voiceError && (
            <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
              {voiceError}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 md:px-4 md:pb-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto flex w-full max-w-3xl items-end gap-2 glass rounded-3xl border p-2 shadow-lg shadow-violet-500/5 transition duration-150 focus-within:border-brand focus-within:shadow-violet-500/20"
        >
          {voiceBusy && (
            <div role="status" className="flex min-h-11 flex-1 items-center gap-3 px-3 text-base">
              {voice.state === "recording" ? (
                <>
                  <span aria-hidden="true" className="size-2.5 shrink-0 animate-pulse rounded-full bg-danger" />
                  <span>{t(locale, "voiceRecording")}</span>
                  <span className="tabular-nums text-muted">{clock}</span>
                </>
              ) : (
                <span className="text-muted">{t(locale, "voiceTranscribing")}</span>
              )}
            </div>
          )}
          <textarea
            hidden={voiceBusy}
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              voice.clearError();
            }}
            onKeyDown={(e) => {
              // Do not send while a Burmese keyboard is still composing a character.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={t(locale, "placeholder")}
            aria-label={t(locale, "placeholder")}
            disabled={awaitingApproval}
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-base placeholder:text-muted focus-visible:outline-none disabled:opacity-50"
          />
          {voice.state === "recording" ? (
            <>
              <button
                type="button"
                onClick={voice.cancel}
                aria-label={t(locale, "micCancel")}
                title={t(locale, "micCancel")}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted transition duration-150 hover:text-fg"
              >
                <XIcon width={20} height={20} />
              </button>
              <button
                type="button"
                onClick={voice.stop}
                aria-label={t(locale, "micStop")}
                title={t(locale, "micStop")}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-danger text-white transition duration-150 hover:brightness-110"
              >
                <StopIcon width={18} height={18} />
              </button>
            </>
          ) : voice.state === "transcribing" ? null : busy ? (
            <button
              type="button"
              onClick={() => stop()}
              aria-label={t(locale, "stop")}
              title={t(locale, "stop")}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-fg text-bg transition-opacity duration-150 hover:opacity-80"
            >
              <StopIcon width={18} height={18} />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={voice.start}
                disabled={awaitingApproval}
                aria-label={t(locale, "micStart")}
                title={t(locale, "micStart")}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-brand-text transition duration-150 hover:brightness-95 disabled:text-muted disabled:opacity-50"
              >
                <MicIcon width={20} height={20} />
              </button>
              <button
                disabled={!input.trim() || awaitingApproval}
                aria-label={t(locale, "send")}
                title={t(locale, "send")}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white transition duration-150 hover:brightness-110 disabled:bg-none disabled:bg-surface-2 disabled:text-muted"
              >
                <ArrowUpIcon width={20} height={20} />
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
