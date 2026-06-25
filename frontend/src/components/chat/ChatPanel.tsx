"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LanguageDropdown } from "@/components/toolbar/LanguageDropdown";
import { ContentTypeChips } from "@/components/toolbar/ContentTypeChips";
import { MessageThread } from "./MessageThread";
import { ChatInputBar } from "./ChatInputBar";
import { useSession } from "@/hooks/useSession";
import { useStream } from "@/hooks/useStream";
import { useUiStore } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";
import { createBackendSession } from "@/lib/sessionSync";
import type { ContentType, Language, Message } from "@/api/types.gen";

interface Props {
  sessionId?: string;
}

export function ChatPanel({ sessionId }: Props) {
  const router = useRouter();
  const {
    session,
    messages,
    artifact,
    contentType: sessionContentType,
    language: sessionLanguage,
    appendMessage,
    updateMessage,
    setArtifact,
    setContentType,
    setLanguage,
  } = useSession(sessionId);
  const { start, abort } = useStream();
  const isStreaming = useUiStore((s) => s.isStreaming);
  const setPanelOpen = useUiStore((s) => s.setPanelOpen);

  // Pre-session "draft preferences". We can't write to a session that doesn't
  // exist yet, so toolbar state lives locally until the user sends the first
  // message and `createBackendSession` runs.
  const [pendingContentType, setPendingContentType] = useState<ContentType>("article");
  const [pendingLanguage, setPendingLanguage] = useState<Language>("en");

  const contentType = session ? sessionContentType : pendingContentType;
  const language = session ? sessionLanguage : pendingLanguage;

  const handleContentTypeChange = useCallback(
    (t: ContentType) => {
      if (session) setContentType(t);
      else setPendingContentType(t);
    },
    [session, setContentType],
  );

  const handleLanguageChange = useCallback(
    (l: Language) => {
      if (session) setLanguage(l);
      else setPendingLanguage(l);
    },
    [session, setLanguage],
  );

  useEffect(() => {
    if (artifact) setPanelOpen(true);
  }, [artifact, setPanelOpen]);

  const send = useCallback(
    async (raw: string, attachedText?: string) => {
      const trimmed = raw.trim();
      if (!trimmed || isStreaming) return;

      // Ensure a backend-backed session exists before we stream into it.
      let activeSession = session;
      if (!activeSession) {
        try {
          activeSession = await createBackendSession({ contentType, language });
        } catch (err) {
          console.error("[ChatPanel] failed to create session:", err);
          return;
        }
        router.replace(`/chat/${activeSession.id}`);
      }

      const composed = attachedText
        ? `[Uploaded document content]: ${attachedText.slice(0, 8000)}\n\n${trimmed}`
        : trimmed;

      const now = new Date().toISOString();
      const userMsg: Message = {
        id: `u_${Date.now().toString(36)}`,
        role: "user",
        content: composed,
        timestamp: now,
        isDraft: false,
      };
      const asstMsg: Message = {
        id: `a_${Date.now().toString(36)}`,
        role: "assistant",
        content: "",
        timestamp: now,
        isDraft: false,
      };
      appendMessage(userMsg);
      appendMessage(asstMsg);

      let chatBuf = "";
      let artBuf = "";
      let touchedArtifact = false;
      const sessionIdForStream = activeSession.id;

      await start(
        {
          sessionId: sessionIdForStream,
          contentType,
          language,
          currentArtifact: artifact,
          messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })),
        },
        {
          onChatDelta: (text) => {
            chatBuf += text;
            updateMessage(asstMsg.id, { content: chatBuf });
          },
          onArtifactDelta: (text) => {
            touchedArtifact = true;
            artBuf += text;
            setArtifact(artBuf);
          },
          onArtifactDone: () => {
            // Marker only — `artBuf` was already pushed via onArtifactDelta.
            touchedArtifact = true;
          },
          onVersionCreated: (versionId, versionNumber, persistedMessageId) => {
            // The backend committed a new artifact version; mirror it locally
            // so the message bubble's CTA can jump to it and the panel can
            // show "vN of M" once history loads.
            const store = useSessionStore.getState();
            store.appendArtifactVersion(sessionIdForStream, {
              id: versionId,
              sessionId: sessionIdForStream,
              version: versionNumber,
              content: artBuf,
              language,
              source: "generation",
              createdAt: new Date().toISOString(),
            });
            updateMessage(asstMsg.id, {
              isDraft: true,
              artifactVersionId: versionId,
            });
            // Snap the panel to "latest" — the freshly streamed version.
            store.setViewingVersion(sessionIdForStream, null);
            // Best-effort backend reconciliation: if the backend's persisted
            // assistant message id differs from our optimistic local id,
            // remember the mapping so a future hydrate doesn't drop the link.
            void persistedMessageId;
            touchedArtifact = true;
          },
          onDone: () => {
            if (touchedArtifact) {
              updateMessage(asstMsg.id, { isDraft: true });
            }
          },
          onError: (msg) => {
            updateMessage(asstMsg.id, {
              content: chatBuf + `\n\n*[error: ${msg}]*`,
            });
          },
        },
        asstMsg.id,
      );
    },
    [
      isStreaming,
      session,
      contentType,
      language,
      router,
      appendMessage,
      updateMessage,
      setArtifact,
      messages,
      artifact,
      start,
    ],
  );

  return (
    <div className="flex h-screen flex-1 flex-col">
      <div className="flex h-14 items-center gap-3 border-b border-edge px-6">
        <ContentTypeChips
          value={contentType}
          onChange={handleContentTypeChange}
          disabled={!!artifact}
        />
        <span className="ml-auto" />
        <LanguageDropdown value={language} onChange={handleLanguageChange} />
      </div>

      <MessageThread
        messages={messages}
        contentType={contentType}
        artifactExists={!!artifact}
      />

      <ChatInputBar
        onSend={send}
        onAbort={abort}
        isStreaming={isStreaming}
      />
    </div>
  );
}
