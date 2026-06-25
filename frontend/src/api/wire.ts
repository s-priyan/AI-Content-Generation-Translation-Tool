/**
 * Wire-format types — mirror the FastAPI Pydantic schemas in
 * backend/app/schemas/*.py exactly (snake_case fields, server-side enums).
 *
 * These are the shapes that travel over HTTP. The UI types in `types.gen.ts`
 * are converted from these by `lib/mappers.ts`. Keeping wire and UI types
 * separate isolates the rest of the app from naming-convention changes on
 * either side.
 *
 * If `npm run gen:api` is wired up later, this file becomes the codegen
 * target; today it is hand-maintained against backend/app/schemas/.
 */

export type WireContentType = "article" | "crm_email" | "push" | "social";

export type WireLanguage = "en" | "fr" | "de" | "ro" | "el";

export type WireMessageRole = "user" | "assistant";

export type WireStreamEventType =
  | "chat_delta"
  | "artifact_delta"
  | "artifact_complete"
  | "version_created"
  | "done"
  | "error";

export type WireArtifactVersionSource = "generation" | "translation" | "edit";

export interface WireArtifactVersion {
  id: string;
  session_id: string;
  version: number;
  content: string;
  language: WireLanguage;
  source: WireArtifactVersionSource;
  created_at: string;
}

export interface WireMessage {
  id: string;
  session_id: string;
  role: WireMessageRole;
  content: string;
  created_at: string;
  is_draft_trigger: boolean;
  artifact_version_id: string | null;
}

export interface WireSession {
  id: string;
  title: string;
  content_type: WireContentType;
  language: WireLanguage;
  artifact: string | null;
  created_at: string;
  updated_at: string;
}

export interface WireSessionWithMessages extends WireSession {
  messages: WireMessage[];
  artifact_versions: WireArtifactVersion[];
}

export interface WireSessionCreate {
  content_type: WireContentType;
  language: WireLanguage;
  title?: string | null;
}

export interface WireSessionUpdate {
  title?: string | null;
  content_type?: WireContentType | null;
  language?: WireLanguage | null;
  artifact?: string | null;
}

export interface WireMessageInput {
  role: WireMessageRole;
  content: string;
}

export interface WireGenerateRequest {
  session_id: string;
  content_type: WireContentType;
  language: WireLanguage;
  messages: WireMessageInput[];
  current_artifact?: string | null;
  uploaded_file_text?: string | null;
}

export interface WireStreamEvent {
  type: WireStreamEventType;
  data?: string | null;
  error_code?: string | null;
  /** Set on `version_created` events. */
  artifact_version_id?: string | null;
  artifact_version?: number | null;
  artifact_message_id?: string | null;
}

export interface WireParsedFileResponse {
  filename: string;
  text: string;
  page_count?: number | null;
  word_count: number;
  mime_type: string;
}

export interface WireTranslateRequest {
  text: string;
  target_language: WireLanguage;
  source_language?: WireLanguage | null;
  preserve_formatting?: boolean;
}

export interface WireTranslateResponse {
  translated_text: string;
  source_language: WireLanguage;
  target_language: WireLanguage;
}

export interface WireConfigOption {
  code: string;
  label: string;
}

export interface WireAppConfigResponse {
  languages: WireConfigOption[];
  content_types: WireConfigOption[];
}

export interface WireApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
