"use client";

import { useEffect, useMemo, useState } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ArtifactPanel } from "@/components/artifact/ArtifactPanel";
import { useSession } from "@/hooks/useSession";
import { useSessionStore } from "@/store/sessionStore";
import { useUiStore } from "@/store/uiStore";
import { loadSessionDetail } from "@/lib/sessionSync";

export function SessionView({ sessionId }: { sessionId: string }) {
  const setActive = useSessionStore((s) => s.setActiveSession);
  const hydratedIds = useSessionStore((s) => s.hydratedIds);
  const viewingVersionId = useSessionStore(
    (s) => s.viewingVersionBySessionId[sessionId] ?? null,
  );
  const setViewingVersion = useSessionStore((s) => s.setViewingVersion);
  const { session, artifact, contentType, language } = useSession(sessionId);
  const panelOpen = useUiStore((s) => s.panelOpen);
  const setPanelOpen = useUiStore((s) => s.setPanelOpen);

  const [notFound, setNotFound] = useState(false);
  const isHydrated = hydratedIds.has(sessionId);

  useEffect(() => {
    setActive(sessionId);
  }, [sessionId, setActive]);

  useEffect(() => {
    let cancelled = false;
    if (isHydrated) return;
    setNotFound(false);
    loadSessionDetail(sessionId)
      .then((s) => {
        if (cancelled) return;
        if (!s) setNotFound(true);
      })
      .catch((err) => {
        console.error("[SessionView] hydrate failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, isHydrated]);

  useEffect(() => {
    if (artifact) setPanelOpen(true);
    else setPanelOpen(false);
  }, [artifact, setPanelOpen]);

  // Pick which version's content to render. `viewingVersionId === null` means
  // "show latest", which we read off `session.artifact` (the denormalized
  // snapshot kept in sync during streaming).
  const view = useMemo(() => {
    const versions = session?.versions ?? [];
    const total = versions.length;
    if (viewingVersionId) {
      const found = versions.find((v) => v.id === viewingVersionId);
      if (found) {
        return {
          body: found.content,
          versionNumber: found.version,
          total,
          isViewingPast: total > 0 && found.version !== total,
        };
      }
    }
    return {
      body: artifact ?? "",
      versionNumber: total || (artifact ? 1 : 0),
      total: total || (artifact ? 1 : 0),
      isViewingPast: false,
    };
  }, [session?.versions, viewingVersionId, artifact]);

  const showArtifact = !!view.body && panelOpen;

  if (notFound) {
    return (
      <div className="flex flex-1 items-center justify-center text-parchment-mute">
        <p>Session not found.</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center text-parchment-mute">
        <p>Loading session…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className={showArtifact ? "w-[45%] min-w-[420px]" : "flex-1"}>
        <ChatPanel sessionId={sessionId} />
      </div>
      {showArtifact && (
        <div className="flex-1">
          <ArtifactPanel
            artifact={view.body}
            contentType={contentType}
            language={language}
            versionNumber={view.versionNumber}
            totalVersions={view.total}
            isViewingPast={view.isViewingPast}
            onBackToLatest={() => setViewingVersion(sessionId, null)}
          />
        </div>
      )}
    </div>
  );
}
