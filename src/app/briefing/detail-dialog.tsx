"use client";

import { useRef, type ReactNode } from "react";
import { XIcon } from "@/components/icons";

/**
 * A list row that opens a small modal with the detail, so the CEO can act without leaving the briefing.
 * `trigger` is the row's content and `children` the modal body; both are rendered on the server.
 */
export function DetailDialog({
  trigger,
  title,
  icon,
  closeLabel,
  children,
}: {
  trigger: ReactNode;
  title: string;
  icon: ReactNode;
  closeLabel: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-surface-2"
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-label={title}
        // A click on the backdrop lands on the dialog element itself (it has no padding of its own).
        onClick={(e) => {
          if (e.target === e.currentTarget) ref.current?.close();
        }}
        className="m-auto max-h-[85vh] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40"
      >
        <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-line bg-surface px-4 py-3">
          {icon}
          <h3 className="flex-1 text-sm font-semibold">{title}</h3>
          <button type="button" className="icon-btn" aria-label={closeLabel} onClick={() => ref.current?.close()}>
            <XIcon />
          </button>
        </div>
        <div className="flex flex-col gap-4 p-4">{children}</div>
      </dialog>
    </>
  );
}
