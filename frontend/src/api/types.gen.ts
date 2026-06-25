/* eslint-disable */
/**
 * UI-facing API types.
 *
 * These mirror the backend's Pydantic schemas (in backend/app/schemas/*.py)
 * but use camelCase + UI-friendly shapes. The conversion between this and
 * the wire format lives in `lib/mappers.ts`.
 *
 * This file is hand-maintained: when backend schemas change, update both
 * `wire.ts` (literal HTTP payloads) and this file (UI-facing). If you wire
 * up `npm run gen:api` later, point codegen at `wire.ts` only and leave
 * this file alone.
 */

export type ContentType = "article" | "crm_email" | "push" | "social";

export type Language = "en" | "fr" | "de" | "ro" | "el";

export type ArtifactVersionSource = "generation" | "translation" | "edit";

export interface ArtifactVersion {
  id: string;
  sessionId: string;
  version: number;
  content: string;
  language: Language;
  source: ArtifactVersionSource;
  createdAt: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isDraft: boolean;
  /** Assistant turns that produced an artifact link to the version they created. */
  artifactVersionId?: string | null;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  contentType: ContentType;
  language: Language;
  messages: Message[];
  /** Latest version's body, denormalized so the artifact panel reads cheaply. */
  artifact: string | null;
  /** Full version history, ordered by version asc. */
  versions: ArtifactVersion[];
}

export type SessionSummary = Omit<Session, "messages" | "artifact" | "versions">;

export interface GenerateRequest {
  sessionId: string;
  contentType: ContentType;
  language: Language;
  /** Full conversation including the latest user message. */
  messages: Pick<Message, "role" | "content">[];
  currentArtifact: string | null;
  /** Optional pre-parsed text to inject as reference material. */
  uploadedFileText?: string | null;
}

/** UI-side stream chunks (translated from the wire's `StreamEvent`). */
export type GenerateChunk =
  | { type: "chat_delta"; text: string }
  | { type: "artifact_delta"; text: string }
  /** Marker only — the artifact text was already delivered via deltas. */
  | { type: "artifact_done" }
  /**
   * Emitted once per generation that produced an artifact, right before
   * `done`. Carries the persisted version ids so the frontend can attach the
   * accumulated text to a real version and link the assistant message.
   */
  | {
      type: "version_created";
      versionId: string;
      version: number;
      messageId: string | null;
    }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string; errorCode?: string };

export interface ParseFileResponse {
  filename: string;
  text: string;
  wordCount: number;
  pageCount: number | null;
  mimeType: string;
}

export interface ConfigOption {
  code: string;
  label: string;
}

export interface AppConfig {
  languages: ConfigOption[];
  contentTypes: ConfigOption[];
}

export interface TranslateRequest {
  text: string;
  targetLanguage: Language;
  sourceLanguage?: Language | null;
  preserveFormatting?: boolean;
}

export interface TranslateResponse {
  translatedText: string;
  sourceLanguage: Language;
  targetLanguage: Language;
}
