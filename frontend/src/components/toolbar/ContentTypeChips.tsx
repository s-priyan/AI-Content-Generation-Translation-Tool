"use client";

import clsx from "clsx";
import type { ContentType } from "@/api/types.gen";

const CHIPS: { value: ContentType; label: string; hint: string }[] = [
  { value: "article", label: "Article", hint: "Long-form" },
  { value: "crm_email", label: "CRM Email", hint: "Lifecycle" },
  { value: "push", label: "Push", hint: "Notification" },
  { value: "social", label: "Social", hint: "Short post" },
];

interface Props {
  value: ContentType;
  onChange: (t: ContentType) => void;
  disabled?: boolean;
}

export function ContentTypeChips({ value, onChange, disabled }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Content type"
      className="flex items-center gap-1 rounded-xs border border-edge bg-surface p-1"
    >
      {CHIPS.map((chip) => {
        const active = chip.value === value;
        return (
          <button
            key={chip.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(chip.value)}
            title={chip.hint}
            className={clsx(
              "relative rounded-xs px-2.5 py-1 text-sm transition disabled:cursor-not-allowed disabled:opacity-60",
              active
                ? "bg-ember/15 text-ember"
                : "text-parchment-dim hover:bg-surface-raised hover:text-parchment",
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
