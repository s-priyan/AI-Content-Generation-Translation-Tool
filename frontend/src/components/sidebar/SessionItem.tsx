"use client";

import { Trash2 } from "lucide-react";
import clsx from "clsx";
import type { Session } from "@/api/types.gen";
import { formatRelativeTime } from "@/lib/formatters";

const TYPE_GLYPH: Record<Session["contentType"], string> = {
  article: "¶",
  crm_email: "✉",
  push: "◔",
  social: "✺",
};

interface Props {
  session: Session;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export function SessionItem({ session, active, onClick, onDelete }: Props) {
  return (
    <div
      className={clsx(
        "group relative flex items-start gap-2.5 rounded-xs px-3 py-2 text-sm transition",
        active
          ? "bg-surface-raised text-parchment"
          : "text-parchment-dim hover:bg-surface-raised/60 hover:text-parchment",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 text-left"
        title={session.title}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={clsx(
              "shrink-0 font-display text-base leading-none",
              active ? "text-ember" : "text-parchment-faint",
            )}
            aria-hidden
          >
            {TYPE_GLYPH[session.contentType]}
          </span>
          <span className="truncate">{session.title}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 pl-[1.4rem] text-xs text-parchment-mute">
          <span className="uppercase tracking-[0.12em]">{session.language}</span>
          <span aria-hidden>·</span>
          <span>{formatRelativeTime(session.createdAt)}</span>
        </div>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${session.title}"?`)) onDelete();
        }}
        className="invisible self-center rounded-xs p-1 text-parchment-mute opacity-0 transition group-hover:visible group-hover:opacity-100 hover:bg-edge hover:text-parchment"
        aria-label="Delete session"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
      </button>

      {active && (
        <span
          className="pointer-events-none absolute inset-y-1 left-0 w-px bg-ember"
          aria-hidden
        />
      )}
    </div>
  );
}
