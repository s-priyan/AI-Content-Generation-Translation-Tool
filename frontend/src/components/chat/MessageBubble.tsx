"use client";

import { useState } from "react";
import { Copy, RefreshCw, ArrowRight, Check } from "lucide-react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/api/types.gen";
import { useUiStore } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";

interface Props {
  message: Message;
  isLast: boolean;
}

export function MessageBubble({ message, isLast }: Props) {
  const isUser = message.role === "user";
  const isStreaming = useUiStore((s) => s.isStreaming);
  const streamingId = useUiStore((s) => s.streamingMessageId);
  const setPanelOpen = useUiStore((s) => s.setPanelOpen);
  const setViewingVersion = useSessionStore((s) => s.setViewingVersion);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const versions = useSessionStore((s) => {
    const sess = s.sessions.find((x) => x.id === s.activeSessionId);
    return sess?.versions ?? [];
  });
  const viewingVersionId = useSessionStore((s) =>
    s.activeSessionId ? (s.viewingVersionBySessionId[s.activeSessionId] ?? null) : null,
  );
  const isThisStreaming = isStreaming && streamingId === message.id;

  const linkedVersion = message.artifactVersionId
    ? versions.find((v) => v.id === message.artifactVersionId)
    : undefined;
  const isViewingThisVersion =
    !!message.artifactVersionId && viewingVersionId === message.artifactVersionId;
  const isLatestVersion =
    !!linkedVersion && versions.length > 0 && linkedVersion.version === versions.length;

  const handleOpenDraft = () => {
    if (!activeSessionId) {
      setPanelOpen(true);
      return;
    }
    // Latest version: clear the override so the panel snaps to "live latest".
    // Older version: pin the panel to that specific version (read-only).
    setViewingVersion(
      activeSessionId,
      message.artifactVersionId && !isLatestVersion ? message.artifactVersionId : null,
    );
    setPanelOpen(true);
  };

  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div
      className={clsx(
        "group flex flex-col animate-fade-up",
        isUser ? "items-end" : "items-start",
      )}
    >
      {isUser ? (
        <div className="max-w-[88%] rounded-xs rounded-tr-none border border-edge bg-surface-raised px-3.5 py-2.5 text-base text-parchment whitespace-pre-wrap">
          {stripUploadedPrefix(message.content)}
        </div>
      ) : (
        <div className="w-full">
          {/* assistant identifier */}
          <div className="mb-2 flex items-center gap-2 eyebrow">
            <span className="inline-block h-1 w-1 rounded-full bg-ember" />
            <span>Assistant</span>
            {isThisStreaming && (
              <PetalSpinner className="ml-1 h-3 w-3" />
            )}
          </div>

          {/* assistant body */}
          <div className="text-base leading-[1.7] text-parchment">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>
                ),
                a: ({ children, ...props }) => (
                  <a
                    {...props}
                    className="text-ember underline decoration-ember/40 underline-offset-2"
                  >
                    {children}
                  </a>
                ),
                code: (props) => {
                  const { inline } = props as { inline?: boolean };
                  return inline ? (
                    <code className="rounded-xs bg-surface-sunk px-1 py-px font-mono text-[0.86em]">
                      {props.children}
                    </code>
                  ) : (
                    <code className="font-mono text-[0.86em]">{props.children}</code>
                  );
                },
              }}
            >
              {message.content || "​"}
            </ReactMarkdown>
            {isThisStreaming && (
              <span className="ml-0.5 inline-block h-[14px] w-[6px] -mb-0.5 bg-ember animate-stream-cursor" />
            )}
          </div>

          {/* draft-ready CTA */}
          {message.isDraft && (
            <button
              type="button"
              onClick={handleOpenDraft}
              aria-pressed={isViewingThisVersion}
              className={clsx(
                "mt-3 inline-flex items-center gap-1.5 rounded-xs border px-2.5 py-1 text-xs transition",
                isViewingThisVersion
                  ? "border-ember/70 bg-ember/20 text-ember"
                  : "border-ember/40 bg-ember/10 text-ember hover:bg-ember/20",
              )}
            >
              <span className="font-display text-base leading-none">✺</span>
              {linkedVersion
                ? `Draft v${linkedVersion.version} ready — see the Artifact panel`
                : "Draft ready — see the Artifact panel"}
              <ArrowRight className="h-3 w-3" />
            </button>
          )}

          {/* actions */}
          {!isThisStreaming && message.content && (
            <div
              className={clsx(
                "mt-2 flex items-center gap-1 transition-opacity",
                isLast ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded-xs px-1.5 py-1 text-xs text-parchment-mute transition hover:bg-surface-raised hover:text-parchment"
                aria-label="Copy message"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copy
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("forge:regenerate", { detail: message.id }),
                  );
                }}
                className="inline-flex items-center gap-1 rounded-xs px-1.5 py-1 text-xs text-parchment-mute transition hover:bg-surface-raised hover:text-parchment"
                aria-label="Regenerate"
              >
                <RefreshCw className="h-3 w-3" /> Regenerate
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Hide the verbose "[Uploaded document content]: ..." prefix from the visible
 * user bubble. The full content is still sent to the model.
 */
function stripUploadedPrefix(content: string): string {
  const m = content.match(/^\[Uploaded document content\]:\s[\s\S]*?\n\n([\s\S]*)$/);
  if (!m) return content;
  return `📎 attached document\n\n${m[1]}`;
}

function PetalSpinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={clsx("animate-petal-spin text-ember", className)}
      aria-hidden
    >
      <g fill="currentColor">
        {Array.from({ length: 6 }).map((_, i) => (
          <ellipse
            key={i}
            cx="12"
            cy="6"
            rx="1.5"
            ry="3.5"
            transform={`rotate(${i * 60} 12 12)`}
            opacity={0.35 + i * 0.1}
          />
        ))}
        <circle cx="12" cy="12" r="1.4" />
      </g>
    </svg>
  );
}
