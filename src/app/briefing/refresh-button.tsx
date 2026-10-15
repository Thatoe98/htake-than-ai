"use client";

import { useState, useTransition } from "react";
import { SparklesIcon } from "@/components/icons";
import { refreshBriefing } from "./actions";

export function RefreshButton({ label, workingLabel }: { label: string; workingLabel: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="btn-primary inline-flex items-center gap-2"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError((await refreshBriefing()).error);
          })
        }
      >
        <SparklesIcon width={16} height={16} />
        {pending ? workingLabel : label}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
