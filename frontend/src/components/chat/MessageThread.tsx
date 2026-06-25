"use client";

import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import type { ContentType, Message } from "@/api/types.gen";
import { useUiStore } from "@/store/uiStore";

interface Props {
  messages: Message[];
  contentType: ContentType;
  artifactExists: boolean;
}

const SUGGESTIONS: Record<ContentType, string[]> = {
  article: [
    "Draft a 600-word article on why translation should be a first-class workflow concern.",
    "Outline a thought-leadership post on iterative content development.",
    "Write an opinion piece pushing back against AI-generated boilerplate.",
  ],
  crm_email: [
    "Lifecycle email day 3 — onboarding nudge for users who haven't created a draft.",
    "Re-engagement email for customers dormant 30+ days.",
    "Announcement email for a small but meaningful product update.",
  ],
  push: [
    "Push notification reminding a user their draft is unfinished.",
    "Re-engagement push for a feature they haven't tried.",
    "Launch notification for a new market or language.",
  ],
  social: [
    "LinkedIn post about iterating on writing rather than perfecting first drafts.",
    "Tweet announcing a quiet ship.",
    "Short founder-voice post on what we just built.",
  ],
};

export function MessageThread({ messages, contentType, artifactExists }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const setPanelOpen = useUiStore((s) => s.setPanelOpen);
  const panelOpen = useUiStore((s) => s.panelOpen);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-8">
        <div className="w-full max-w-xl text-center animate-fade-up">
          <p className="eyebrow mb-3">A new draft</p>
          <h1 className="font-display text-4xl leading-[1.05] text-parchment">
            What are we writing<br />
            <em className="text-ember">today?</em>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-parchment-dim">
            Pick a content type above, set the target language, then describe what you need.
            <br />
            Refine it line by line — every reply updates the artifact on the right.
          </p>

          <div className="mt-9 grid gap-2 text-left">
            {SUGGESTIONS[contentType].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  // bubble up via custom event so ChatInputBar can prefill
                  window.dispatchEvent(
                    new CustomEvent("forge:prefill", { detail: s }),
                  );
                }}
                className="group rounded-xs border border-edge bg-surface/40 px-4 py-3 text-sm text-parchment-dim transition hover:border-ember/40 hover:bg-surface-raised hover:text-parchment"
              >
                <span className="font-mono mr-2 text-xs uppercase tracking-[0.14em] text-ember/70">
                  Try
                </span>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-7 px-6 py-9">
        {messages.map((m, idx) => (
          <MessageBubble
            key={m.id}
            message={m}
            isLast={idx === messages.length - 1}
          />
        ))}

        {artifactExists && !panelOpen && (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="self-start rounded-xs border border-ember/40 bg-ember/10 px-3 py-1.5 text-xs text-ember transition hover:bg-ember/20"
          >
            Show artifact panel <ArrowRight className="ml-1 inline h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
