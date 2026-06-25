"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Plus, Sparkle } from "lucide-react";
import { useSessionStore } from "@/store/sessionStore";
import { deleteSessionEverywhere } from "@/lib/sessionSync";
import { SessionItem } from "./SessionItem";

export function SessionSidebar() {
  const router = useRouter();
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const setActive = useSessionStore((s) => s.setActiveSession);
  const remove = (id: string) => {
    void deleteSessionEverywhere(id);
  };

  const grouped = useMemo(() => groupByRecency(sessions), [sessions]);

  const handleNewChat = () => {
    setActive(null);
    router.push("/chat");
  };

  return (
    <aside
      className="flex h-screen w-64 shrink-0 flex-col border-r border-edge bg-surface-sunk/80 backdrop-blur-sm"
      aria-label="Session history"
    >
      {/* brand */}
      <div className="flex h-14 items-center gap-2 px-5 border-b border-edge/60">
        <div className="flex h-7 w-7 items-center justify-center rounded-xs bg-ember/15 text-ember">
          <Sparkle className="h-3.5 w-3.5" strokeWidth={1.6} />
        </div>
        <span className="font-display text-2xl leading-none text-parchment">
          Forge
        </span>
        <span className="ml-auto eyebrow">v0.1</span>
      </div>

      {/* new chat */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={handleNewChat}
          className="group flex w-full items-center gap-2.5 rounded-xs border border-edge bg-transparent px-3 py-2.5 text-left text-sm text-parchment-dim transition hover:border-ember/40 hover:bg-surface-raised hover:text-parchment"
        >
          <Plus className="h-3.5 w-3.5 transition group-hover:text-ember" strokeWidth={2} />
          <span>New draft</span>
          <span className="ml-auto eyebrow opacity-0 transition group-hover:opacity-100">
            ⌘N
          </span>
        </button>
      </div>

      {/* sessions */}
      <div className="flex-1 overflow-y-auto px-3 pt-5 pb-4">
        {sessions.length === 0 ? (
          <p className="px-3 text-sm text-parchment-mute">
            No drafts yet. Start one above.
          </p>
        ) : (
          <div className="space-y-5">
            {grouped.map(([label, items]) => (
              <section key={label}>
                <h3 className="eyebrow px-3 pb-1.5">{label}</h3>
                <ul className="space-y-0.5">
                  {items.map((s) => (
                    <li key={s.id}>
                      <SessionItem
                        session={s}
                        active={s.id === activeId}
                        onClick={() => {
                          setActive(s.id);
                          router.push(`/chat/${s.id}`);
                        }}
                        onDelete={() => remove(s.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* footer */}
      <div className="border-t border-edge/60 px-5 py-3">
        <p className="text-xs leading-relaxed text-parchment-mute">
          A workspace for content that has to work in more than one language.
        </p>
      </div>
    </aside>
  );
}

function groupByRecency(sessions: ReturnType<typeof useSessionStore.getState>["sessions"]) {
  const now = Date.now();
  const today: typeof sessions = [];
  const week: typeof sessions = [];
  const earlier: typeof sessions = [];

  for (const s of sessions) {
    const age = now - new Date(s.createdAt).getTime();
    if (age < 24 * 3600_000) today.push(s);
    else if (age < 7 * 24 * 3600_000) week.push(s);
    else earlier.push(s);
  }

  const groups: [string, typeof sessions][] = [];
  if (today.length) groups.push(["Today", today]);
  if (week.length) groups.push(["This week", week]);
  if (earlier.length) groups.push(["Earlier", earlier]);
  return groups;
}
