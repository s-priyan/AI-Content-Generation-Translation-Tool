/**
 * Backend-backed CRUD/hydration helpers for the session store.
 *
 * Async actions live here (not on the Zustand store) so the store stays a
 * dumb in-memory cache. All persistence goes through `api.sessions.*`.
 */
import { ApiError } from "@/api/client";
import { api } from "@/api/endpoints";
import type { ContentType, Language, Session } from "@/api/types.gen";
import { useSessionStore } from "@/store/sessionStore";

/** Load the sidebar list of sessions from the backend. */
export async function loadAllSessions(): Promise<void> {
  try {
    const summaries = await api.sessions.list();
    const store = useSessionStore.getState();
    const existing = new Map(store.sessions.map((s) => [s.id, s]));

    const merged: Session[] = summaries.map((summary) => {
      const local = existing.get(summary.id);
      return local
        ? { ...local, ...summary }
        : { ...summary, messages: [], artifact: null, versions: [] };
    });

    useSessionStore.setState({ sessions: merged });
  } catch (err) {
    if (err instanceof ApiError) {
      console.error("[sessionSync] failed to list sessions:", err.message);
    } else {
      throw err;
    }
  }
}

/** Hydrate a single session's messages + artifact from the backend. */
export async function loadSessionDetail(id: string): Promise<Session | null> {
  const store = useSessionStore.getState();
  if (store.hydratedIds.has(id)) {
    return store.sessions.find((s) => s.id === id) ?? null;
  }

  try {
    const session = await api.sessions.get(id);
    useSessionStore.getState().upsertSession(session);
    useSessionStore.getState().markHydrated(id);
    return session;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      useSessionStore.getState().removeSessionLocal(id);
      return null;
    }
    throw err;
  }
}

/** Create a new session on the backend and select it locally. */
export async function createBackendSession(seed: {
  contentType: ContentType;
  language: Language;
  title?: string;
}): Promise<Session> {
  const session = await api.sessions.create(seed);
  const store = useSessionStore.getState();
  store.upsertSession(session);
  store.markHydrated(session.id);
  store.setActiveSession(session.id);
  return session;
}

/** Delete a session both server-side and locally. */
export async function deleteSessionEverywhere(id: string): Promise<void> {
  try {
    await api.sessions.delete(id);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
  }
  useSessionStore.getState().removeSessionLocal(id);
}
