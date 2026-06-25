import { create } from "zustand";
import type {
  ArtifactVersion,
  ContentType,
  Language,
  Message,
  Session,
} from "@/api/types.gen";

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  /** Tracks which sessions have had their messages fetched from the backend. */
  hydratedIds: Set<string>;
  /**
   * Per-session "currently visible" version id in the artifact panel.
   * Missing key OR explicit `null` means "show the latest version".
   * Set non-null when the user clicks a Draft-ready CTA on a past message.
   */
  viewingVersionBySessionId: Record<string, string | null>;

  setSessions: (sessions: Session[]) => void;
  upsertSession: (session: Session) => void;
  removeSessionLocal: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  renameSession: (id: string, title: string) => void;
  markHydrated: (id: string) => void;

  appendMessage: (sessionId: string, message: Message) => void;
  updateMessage: (sessionId: string, messageId: string, patch: Partial<Message>) => void;
  setArtifact: (sessionId: string, artifact: string | null) => void;
  setContentType: (sessionId: string, contentType: ContentType) => void;
  setLanguage: (sessionId: string, language: Language) => void;

  appendArtifactVersion: (sessionId: string, version: ArtifactVersion) => void;
  /** `null` means "go back to latest". */
  setViewingVersion: (sessionId: string, versionId: string | null) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  sessions: [],
  activeSessionId: null,
  hydratedIds: new Set<string>(),
  viewingVersionBySessionId: {},

  setSessions: (sessions) => set({ sessions }),

  upsertSession: (session) =>
    set((s) => {
      const idx = s.sessions.findIndex((x) => x.id === session.id);
      if (idx === -1) {
        return { sessions: [session, ...s.sessions] };
      }
      const local = s.sessions[idx];
      const next = [...s.sessions];
      // Defensive merge: a server payload received mid-stream must never
      // demote in-memory state. Keep the longer `messages`/`versions` arrays,
      // and never null out an existing `artifact`.
      next[idx] = {
        ...local,
        ...session,
        messages:
          session.messages.length >= local.messages.length
            ? session.messages
            : local.messages,
        versions:
          (session.versions?.length ?? 0) >= (local.versions?.length ?? 0)
            ? (session.versions ?? local.versions ?? [])
            : (local.versions ?? []),
        artifact: session.artifact ?? local.artifact,
      };
      return { sessions: next };
    }),

  removeSessionLocal: (id) =>
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);
      const activeSessionId =
        s.activeSessionId === id ? (sessions[0]?.id ?? null) : s.activeSessionId;
      const hydratedIds = new Set(s.hydratedIds);
      hydratedIds.delete(id);
      const viewingVersionBySessionId = { ...s.viewingVersionBySessionId };
      delete viewingVersionBySessionId[id];
      return { sessions, activeSessionId, hydratedIds, viewingVersionBySessionId };
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  renameSession: (id, title) =>
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)),
    })),

  markHydrated: (id) =>
    set((s) => {
      if (s.hydratedIds.has(id)) return s;
      const hydratedIds = new Set(s.hydratedIds);
      hydratedIds.add(id);
      return { hydratedIds };
    }),

  appendMessage: (sessionId, message) =>
    set((s) => ({
      sessions: s.sessions.map((x) => {
        if (x.id !== sessionId) return x;
        const isFirstUser =
          message.role === "user" && x.messages.every((m) => m.role !== "user");
        return {
          ...x,
          title: isFirstUser ? deriveTitle(message.content) : x.title,
          messages: [...x.messages, message],
        };
      }),
    })),

  updateMessage: (sessionId, messageId, patch) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id !== sessionId
          ? x
          : {
              ...x,
              messages: x.messages.map((m) =>
                m.id === messageId ? { ...m, ...patch } : m,
              ),
            },
      ),
    })),

  setArtifact: (sessionId, artifact) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId ? { ...x, artifact } : x,
      ),
    })),

  setContentType: (sessionId, contentType) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId ? { ...x, contentType } : x,
      ),
    })),

  setLanguage: (sessionId, language) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId ? { ...x, language } : x,
      ),
    })),

  appendArtifactVersion: (sessionId, version) =>
    set((s) => ({
      sessions: s.sessions.map((x) => {
        if (x.id !== sessionId) return x;
        // Idempotency: if a version with this id already exists (e.g. from a
        // hydrate that ran in parallel with the stream), don't duplicate.
        const existing = x.versions ?? [];
        if (existing.some((v) => v.id === version.id)) return x;
        return {
          ...x,
          versions: [...existing, version],
          artifact: version.content,
        };
      }),
    })),

  setViewingVersion: (sessionId, versionId) =>
    set((s) => ({
      viewingVersionBySessionId: {
        ...s.viewingVersionBySessionId,
        [sessionId]: versionId,
      },
    })),
}));

function deriveTitle(content: string): string {
  const trimmed = stripUploadedPrefix(content).trim().replace(/\s+/g, " ");
  if (!trimmed) return "Untitled draft";
  return trimmed.length > 64 ? trimmed.slice(0, 61) + "…" : trimmed;
}

/** Hide the `[Uploaded document content]: …` prefix from auto-derived titles. */
function stripUploadedPrefix(content: string): string {
  const m = content.match(/^\[Uploaded document content\]:\s[\s\S]*?\n\n([\s\S]*)$/);
  return m ? m[1] : content;
}
