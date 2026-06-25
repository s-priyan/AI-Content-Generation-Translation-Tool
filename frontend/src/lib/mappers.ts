/**
 * Pure conversion functions between wire format (`api/wire.ts` — backend
 * snake_case) and UI format (`api/types.gen.ts` — camelCase).
 *
 * Keep these one-way and side-effect-free; they are imported from both the
 * API client and the streaming consumer.
 */
import type {
  AppConfig,
  ArtifactVersion,
  GenerateChunk,
  GenerateRequest,
  Message,
  ParseFileResponse,
  Session,
  SessionSummary,
  TranslateRequest,
  TranslateResponse,
} from "@/api/types.gen";
import type {
  WireAppConfigResponse,
  WireArtifactVersion,
  WireGenerateRequest,
  WireMessage,
  WireParsedFileResponse,
  WireSession,
  WireSessionWithMessages,
  WireStreamEvent,
  WireTranslateRequest,
  WireTranslateResponse,
} from "@/api/wire";

/* ---------- session / message / artifact versions ---------- */

export function wireArtifactVersionToUi(v: WireArtifactVersion): ArtifactVersion {
  return {
    id: v.id,
    sessionId: v.session_id,
    version: v.version,
    content: v.content,
    language: v.language,
    source: v.source,
    createdAt: v.created_at,
  };
}

export function wireMessageToUi(m: WireMessage): Message {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.created_at,
    isDraft: m.is_draft_trigger,
    artifactVersionId: m.artifact_version_id ?? null,
  };
}

export function wireSessionToUi(s: WireSession): Session {
  return {
    id: s.id,
    title: s.title,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    contentType: s.content_type,
    language: s.language,
    artifact: s.artifact,
    messages: [],
    versions: [],
  };
}

export function wireSessionToSummary(s: WireSession): SessionSummary {
  return {
    id: s.id,
    title: s.title,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    contentType: s.content_type,
    language: s.language,
  };
}

export function wireSessionWithMessagesToUi(s: WireSessionWithMessages): Session {
  const messages = s.messages.map(wireMessageToUi);
  // The backend records `is_draft_trigger` on the user turn that produced a
  // draft. The UI shows the "Draft ready" CTA on the assistant reply that
  // followed it, so move the flag forward by one when applicable.
  for (let i = 0; i < messages.length - 1; i++) {
    const cur = messages[i];
    const next = messages[i + 1];
    if (cur.role === "user" && cur.isDraft && next.role === "assistant") {
      cur.isDraft = false;
      next.isDraft = true;
    }
  }
  // The CTA also needs to render on assistant messages whose own
  // `artifact_version_id` was populated by the backend (e.g. the migration
  // backfill or rows persisted before the trigger flag existed).
  for (const m of messages) {
    if (m.role === "assistant" && m.artifactVersionId) {
      m.isDraft = true;
    }
  }
  return {
    ...wireSessionToUi(s),
    messages,
    versions: s.artifact_versions.map(wireArtifactVersionToUi),
  };
}

/* ---------- generate ---------- */

export function uiToWireGenerateRequest(req: GenerateRequest): WireGenerateRequest {
  return {
    session_id: req.sessionId,
    content_type: req.contentType,
    language: req.language,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    current_artifact: req.currentArtifact,
    uploaded_file_text: req.uploadedFileText ?? null,
  };
}

export function wireStreamEventToChunk(ev: WireStreamEvent): GenerateChunk | null {
  switch (ev.type) {
    case "chat_delta":
      return { type: "chat_delta", text: ev.data ?? "" };
    case "artifact_delta":
      return { type: "artifact_delta", text: ev.data ?? "" };
    case "artifact_complete":
      // Marker only — the full artifact text has already arrived via deltas.
      // Carrying `ev.data` here would clobber the accumulated artifact with `""`.
      return { type: "artifact_done" };
    case "version_created":
      // The backend persisted a new artifact version; surface ids so the
      // store can attach the streamed text to a real version.
      if (!ev.artifact_version_id || ev.artifact_version == null) return null;
      return {
        type: "version_created",
        versionId: ev.artifact_version_id,
        version: ev.artifact_version,
        messageId: ev.artifact_message_id ?? null,
      };
    case "done":
      return { type: "done", messageId: "" };
    case "error":
      return {
        type: "error",
        message: ev.data ?? "Generation failed.",
        errorCode: ev.error_code ?? undefined,
      };
    default:
      return null;
  }
}

/* ---------- file parser ---------- */

export function wireParsedFileToUi(p: WireParsedFileResponse): ParseFileResponse {
  return {
    filename: p.filename,
    text: p.text,
    wordCount: p.word_count,
    pageCount: p.page_count ?? null,
    mimeType: p.mime_type,
  };
}

/* ---------- config ---------- */

export function wireAppConfigToUi(c: WireAppConfigResponse): AppConfig {
  return {
    languages: c.languages,
    contentTypes: c.content_types,
  };
}

/* ---------- translate ---------- */

export function uiToWireTranslateRequest(req: TranslateRequest): WireTranslateRequest {
  return {
    text: req.text,
    target_language: req.targetLanguage,
    source_language: req.sourceLanguage ?? null,
    preserve_formatting: req.preserveFormatting ?? true,
  };
}

export function wireTranslateResponseToUi(r: WireTranslateResponse): TranslateResponse {
  return {
    translatedText: r.translated_text,
    sourceLanguage: r.source_language,
    targetLanguage: r.target_language,
  };
}
