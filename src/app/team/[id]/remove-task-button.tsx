"use client";

import { useState, useTransition } from "react";
import { removeTask } from "./actions";

/** Two-step remove: a first click asks, the second one deletes. No browser dialog. */
export function RemoveTaskButton({ ownerId, taskId }: { ownerId: string; taskId: string }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="text-xs text-danger underline">
        Remove
      </button>
    );
  }
  return (
    <span className="flex items-center gap-3 text-xs">
      <span className="text-muted">Remove this task?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => removeTask(ownerId, taskId))}
        className="font-medium text-danger underline"
      >
        {pending ? "Removing…" : "Yes, remove"}
      </button>
      <button type="button" disabled={pending} onClick={() => setAsking(false)} className="text-muted underline">
        Cancel
      </button>
    </span>
  );
}
