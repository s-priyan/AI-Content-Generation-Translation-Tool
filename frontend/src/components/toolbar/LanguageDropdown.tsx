"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import clsx from "clsx";
import type { Language } from "@/api/types.gen";

const LANGUAGES: { code: Language; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "ro", label: "Romanian", native: "Română" },
  { code: "el", label: "Greek", native: "Ελληνικά" },
];

interface Props {
  value: Language;
  onChange: (lang: Language) => void;
}

export function LanguageDropdown({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const current = LANGUAGES.find((l) => l.code === value) ?? LANGUAGES[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xs border border-edge bg-surface px-3 py-1.5 text-sm text-parchment-dim transition hover:border-ember/40 hover:text-parchment"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Languages className="h-3.5 w-3.5" strokeWidth={1.6} />
        <span className="font-mono uppercase tracking-[0.12em] text-xs text-ember">
          {current.code}
        </span>
        <span className="text-parchment-dim">{current.native}</span>
        <ChevronDown
          className={clsx("h-3 w-3 transition-transform", open && "rotate-180")}
          strokeWidth={1.8}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1.5 w-48 origin-top-right animate-fade-up rounded-xs border border-edge bg-surface-raised py-1 shadow-soft"
        >
          {LANGUAGES.map((lang) => {
            const selected = lang.code === value;
            return (
              <li key={lang.code}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(lang.code);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={selected}
                  className={clsx(
                    "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition",
                    selected
                      ? "text-parchment"
                      : "text-parchment-dim hover:bg-surface hover:text-parchment",
                  )}
                >
                  <span className="font-mono w-7 text-xs uppercase tracking-[0.12em] text-ember">
                    {lang.code}
                  </span>
                  <span className="flex-1">{lang.native}</span>
                  <span className="text-xs text-parchment-mute">{lang.label}</span>
                  {selected && (
                    <Check className="h-3.5 w-3.5 text-ember" strokeWidth={1.8} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
