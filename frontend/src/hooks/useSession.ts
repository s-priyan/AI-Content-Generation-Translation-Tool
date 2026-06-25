"use client";

import { useCallback, useMemo } from "react";
import { useSessionStore } from "@/store/sessionStore";
import type { ContentType, Language, Message, Session } from "@/api/types.gen";

/**
 * Clean read/write API around sessionStore for components. Avoids forcing
 * components to know about Zustand selector internals.
 *
 * Writers resolve the active session id at call time (via `getState()`) so
 * that a callback captured in a closure before any session existed still
 * targets the freshly-created session once `setActiveSession` has run.
 */
export function useSession(sessionId?: string | null) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const id = sessionId ?? activeId;

  const session = useMemo<Session | null>(
    () => sessions.find((x) => x.id === id) ?? null,
    [sessions, id],
  );

  const appendMessage = useSessionStore((s) => s.appendMessage);
  const updateMessage = useSessionStore((s) => s.updateMessage);
  const setArtifact = useSessionStore((s) => s.setArtifact);
  const setContentType = useSessionStore((s) => s.setContentType);
  const setLanguage = useSessionStore((s) => s.setLanguage);

  const resolveId = useCallback(
    () => sessionId ?? useSessionStore.getState().activeSessionId,
    [sessionId],
  );

  const append = useCallback(
    (m: Message) => {
      const live = resolveId();
      if (live) appendMessage(live, m);
    },
    [resolveId, appendMessage],
  );
  const update = useCallback(
    (mid: string, patch: Partial<Message>) => {
      const live = resolveId();
      if (live) updateMessage(live, mid, patch);
    },
    [resolveId, updateMessage],
  );
  const setArt = useCallback(
    (a: string | null) => {
      const live = resolveId();
      if (live) setArtifact(live, a);
    },
    [resolveId, setArtifact],
  );
  const setType = useCallback(
    (t: ContentType) => {
      const live = resolveId();
      if (live) setContentType(live, t);
    },
    [resolveId, setContentType],
  );
  const setLang = useCallback(
    (l: Language) => {
      const live = resolveId();
      if (live) setLanguage(live, l);
    },
    [resolveId, setLanguage],
  );

  return {
    session,
    messages: session?.messages ?? [],
    artifact: session?.artifact ?? null,
    contentType: session?.contentType ?? "article",
    language: session?.language ?? "en",
    appendMessage: append,
    updateMessage: update,
    setArtifact: setArt,
    setContentType: setType,
    setLanguage: setLang,
  };
}
