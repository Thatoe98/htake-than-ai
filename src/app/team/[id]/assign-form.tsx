"use client";

import { useActionState } from "react";
import { assignTask, type AssignState } from "./actions";

export function AssignTaskForm({ ownerId }: { ownerId: string }) {
  const [state, action, pending] = useActionState<AssignState, FormData>(assignTask.bind(null, ownerId), {});
  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Task
        <input name="title" required maxLength={200} className="field" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Deadline (optional)
          <input name="deadline" type="date" className="field" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Notes (optional)
          <input name="notes" maxLength={2000} className="field" />
        </label>
      </div>
      <button disabled={pending} className="btn-primary w-full">{pending ? "Assigning…" : "Assign task"}</button>
      {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{state.ok}</p>}
    </form>
  );
}
