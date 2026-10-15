"use client";

import { useActionState } from "react";
import { EyeIcon, LogoMark } from "@/components/icons";
import { completeOnboarding, type OnboardingState } from "./actions";

export default function OnboardingPage() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <LogoMark size={52} />
        <h1 className="text-gradient text-3xl font-semibold">Welcome</h1>
      </div>
      <p className="flex gap-2.5 rounded-2xl bg-notice-bg p-4 text-sm text-notice-fg">
        <EyeIcon width={18} height={18} className="mt-0.5 shrink-0" />
        <span>
          Your manager and CEO can see your chats with this assistant, and the work logs and reports you file.
          Everything you write here is stored and linked to your name.
        </span>
      </p>
      <form action={action} className="glass flex flex-col gap-4 rounded-2xl border p-5 shadow-xl shadow-violet-500/5">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Temporary password
          <input name="current" type="password" autoComplete="current-password" required className="field font-normal" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          New password (8+ characters)
          <input name="next" type="password" autoComplete="new-password" minLength={8} required className="field font-normal" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Repeat new password
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} required className="field font-normal" />
        </label>
        <label className="flex items-start gap-2.5 text-sm">
          <input name="accept" type="checkbox" className="mt-0.5 size-5 accent-brand" />
          I understand that my manager and CEO can read my chats.
        </label>
        {state.error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}
        <button disabled={pending} className="btn-primary w-full">
          {pending ? "Saving…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
