"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";
import { ArrowLeftToLine } from "lucide-react";
import { ArtifactToolbar } from "./ArtifactToolbar";
import type { ContentType, Language } from "@/api/types.gen";
import { useUiStore } from "@/store/uiStore";

interface Props {
  artifact: string;
  contentType: ContentType;
  language: Language;
  /** 1-based current version number (the one shown). */
  versionNumber: number;
  /** Highest version number persisted for this session. */
  totalVersions: number;
  /** True when the panel is showing a non-latest version (read-only mode). */
  isViewingPast: boolean;
  onBackToLatest: () => void;
}

export function ArtifactPanel({
  artifact,
  contentType,
  language,
  versionNumber,
  totalVersions,
  isViewingPast,
  onBackToLatest,
}: Props) {
  const setPanelOpen = useUiStore((s) => s.setPanelOpen);
  const isStreaming = useUiStore((s) => s.isStreaming);
  const [pulse, setPulse] = useState(false);
  const lastLenRef = useRef<number>(artifact.length);

  // pulse the panel border whenever a new version arrives
  useEffect(() => {
    if (artifact.length !== lastLenRef.current && !isStreaming) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1400);
      return () => clearTimeout(t);
    }
    lastLenRef.current = artifact.length;
  }, [artifact, isStreaming]);

  const eyebrow = isViewingPast ? "Earlier draft" : "Latest draft";

  return (
    <section
      className={clsx(
        "relative flex h-screen w-full flex-col border-l border-edge bg-surface/40 animate-panel-slide",
        pulse && "animate-version-pulse",
      )}
      aria-label="Artifact panel"
    >
      <ArtifactToolbar
        contentType={contentType}
        language={language}
        artifact={artifact}
        onClose={() => setPanelOpen(false)}
      />

      {totalVersions > 0 && (
        <div className="flex items-center gap-2 border-b border-edge/60 bg-surface/40 px-5 py-2 text-xs">
          <span
            className={clsx(
              "rounded-xs border px-2 py-0.5 font-mono uppercase tracking-[0.14em]",
              isViewingPast
                ? "border-parchment-mute/40 bg-surface text-parchment-dim"
                : "border-ember/30 bg-ember/10 text-ember",
            )}
          >
            v{versionNumber} of {totalVersions}
          </span>
          {isViewingPast ? (
            <>
              <span className="text-parchment-mute">
                Read-only — earlier draft from this session.
              </span>
              <button
                type="button"
                onClick={onBackToLatest}
                className="ml-auto inline-flex items-center gap-1 rounded-xs border border-edge bg-surface px-2 py-1 text-parchment-dim transition hover:border-ember/40 hover:text-parchment"
              >
                <ArrowLeftToLine className="h-3 w-3" /> Back to latest
              </button>
            </>
          ) : (
            <span className="text-parchment-mute">
              Live — refinements append a new version.
            </span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <article className="mx-auto max-w-[68ch] px-9 py-10">
          <div className="eyebrow mb-3">{eyebrow}</div>
          <div className="artifact-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact}</ReactMarkdown>
          </div>
        </article>
      </div>

      <footer className="border-t border-edge/60 px-5 py-2.5 text-xs text-parchment-mute">
        {isViewingPast
          ? "Click ✺ Draft ready under newer messages to jump to those versions."
          : "Updates live as you refine — earlier versions live in the chat history."}
      </footer>
    </section>
  );
}
