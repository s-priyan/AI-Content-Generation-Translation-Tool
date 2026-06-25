"use client";

import { useCallback, useRef } from "react";
import { api } from "@/api/endpoints";
import type { GenerateRequest } from "@/api/types.gen";
import { useUiStore } from "@/store/uiStore";

interface StreamHandlers {
  onChatDelta: (text: string) => void;
  onArtifactDelta: (text: string) => void;
  /** Fired when the backend signals artifact streaming finished. The full
   *  artifact text has already been delivered by `onArtifactDelta`. */
  onArtifactDone: () => void;
  /** Fired once per generation that produced an artifact, right before `done`.
   *  Carries the persisted version's id, sequential number, and the assistant
   *  message id it was attached to (when known). */
  onVersionCreated: (versionId: string, version: number, messageId: string | null) => void;
  onDone: (messageId: string) => void;
  onError: (message: string) => void;
}

/**
 * Wraps api.generate() — runs the SSE generator and routes typed chunks to
 * caller handlers. Manages the global streaming flag and exposes abort().
 */
export function useStream() {
  const abortRef = useRef<AbortController | null>(null);
  const setStreaming = useUiStore((s) => s.setStreaming);

  const start = useCallback(
    async (req: GenerateRequest, handlers: StreamHandlers, streamingMessageId: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true, streamingMessageId);

      try {
        for await (const chunk of api.generate(req, controller.signal)) {
          switch (chunk.type) {
            case "chat_delta":
              handlers.onChatDelta(chunk.text);
              break;
            case "artifact_delta":
              handlers.onArtifactDelta(chunk.text);
              break;
            case "artifact_done":
              handlers.onArtifactDone();
              break;
            case "version_created":
              handlers.onVersionCreated(chunk.versionId, chunk.version, chunk.messageId);
              break;
            case "done":
              handlers.onDone(chunk.messageId);
              break;
            case "error":
              handlers.onError(chunk.message);
              break;
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          handlers.onError((err as Error).message);
        }
      } finally {
        setStreaming(false, null);
        abortRef.current = null;
      }
    },
    [setStreaming],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { start, abort };
}
