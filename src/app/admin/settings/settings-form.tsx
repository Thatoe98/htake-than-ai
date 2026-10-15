"use client";

import { useActionState } from "react";
import { saveSettings, type SettingsState } from "./actions";

/** capUsd is null for everyone but the developer: the cap is a cost figure the CEO does not see. */
export function SettingsForm({ capUsd, timezone }: { capUsd: number | null; timezone: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});

  return (
    <form action={action} className="card flex max-w-xl flex-col gap-5 p-5">
      {capUsd !== null && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Monthly AI spending cap (USD)
          <input
            name="capUsd"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            defaultValue={capUsd}
            required
            className="field font-normal"
          />
          <span className="text-xs font-normal text-muted">
            When this month&apos;s AI cost reaches the cap, chat stops for everyone until next month or until you raise it.
          </span>
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Company timezone
        <input name="timezone" defaultValue={timezone} required className="field font-normal" autoCapitalize="none" />
        <span className="text-xs font-normal text-muted">
          An IANA name such as Asia/Yangon. Dates in reports and logs follow it.
        </span>
      </label>
      {state.error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-text">
          {state.ok}
        </p>
      )}
      <button disabled={pending} className="btn-primary self-start">
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
