/**
 * The API surface the frontend uses. One place to change when endpoints change.
 *
 * Components import only from here; they never touch `client.ts`, `wire.ts`,
 * or the mock backend. Wire-format conversion happens via `lib/mappers.ts`.
 *
 * If `NEXT_PUBLIC_USE_MOCK_API === "true"` the in-process mock takes over
 * `generate` and `parseFile` so the UI stays interactive without a server.
 */
import { http, sse } from "./client";
import type {
  AppConfig,
  GenerateChunk,
  GenerateRequest,
  ParseFileResponse,
  Session,
  SessionSummary,
  TranslateRequest,
  TranslateResponse,
} from "./types.gen";
import type {
  WireAppConfigResponse,
  WireParsedFileResponse,
  WireSession,
  WireSessionCreate,
  WireSessionUpdate,
  WireSessionWithMessages,
  WireStreamEvent,
  WireTranslateResponse,
} from "./wire";
import {
  uiToWireGenerateRequest,
  uiToWireTranslateRequest,
  wireAppConfigToUi,
  wireParsedFileToUi,
  wireSessionToSummary,
  wireSessionToUi,
  wireSessionWithMessagesToUi,
  wireStreamEventToChunk,
  wireTranslateResponseToUi,
} from "@/lib/mappers";
import { mockGenerate, mockParseFile } from "@/lib/mockBackend";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

export const api = {
  /** Stream an SSE generation; yields UI-shaped chunks. */
  generate(req: GenerateRequest, signal?: AbortSignal): AsyncGenerator<GenerateChunk> {
    if (USE_MOCK) return mockGenerate(req, signal);
    return generateStream(req, signal);
  },

  sessions: {
    /** Sidebar list (no messages, no artifact body). */
    async list(limit = 50): Promise<SessionSummary[]> {
      if (USE_MOCK) return [];
      const rows = await http<WireSession[]>(`/api/v1/sessions?limit=${limit}`);
      return rows.map(wireSessionToSummary);
    },

    /** Full session including messages, used when entering a session. */
    async get(id: string): Promise<Session> {
      if (USE_MOCK) throw new Error("mock mode — sessions are local-only");
      const row = await http<WireSessionWithMessages>(`/api/v1/sessions/${id}`);
      return wireSessionWithMessagesToUi(row);
    },

    /** Create a new session and return its server-assigned id. */
    async create(seed: { contentType: Session["contentType"]; language: Session["language"]; title?: string }): Promise<Session> {
      if (USE_MOCK) throw new Error("mock mode — sessions are local-only");
      const body: WireSessionCreate = {
        content_type: seed.contentType,
        language: seed.language,
        title: seed.title ?? null,
      };
      const row = await http<WireSession>("/api/v1/sessions", {
        method: "POST",
        json: body,
      });
      return wireSessionToUi(row);
    },

    /** Patch a subset of session fields. */
    async update(
      id: string,
      patch: Partial<{ title: string; contentType: Session["contentType"]; language: Session["language"]; artifact: string | null }>,
    ): Promise<Session> {
      if (USE_MOCK) throw new Error("mock mode — sessions are local-only");
      const body: WireSessionUpdate = {
        title: patch.title ?? null,
        content_type: patch.contentType ?? null,
        language: patch.language ?? null,
        artifact: patch.artifact ?? null,
      };
      const row = await http<WireSession>(`/api/v1/sessions/${id}`, {
        method: "PATCH",
        json: body,
      });
      return wireSessionToUi(row);
    },

    delete(id: string): Promise<void> {
      if (USE_MOCK) return Promise.resolve();
      return http<void>(`/api/v1/sessions/${id}`, { method: "DELETE" });
    },
  },

  /** Server-side file parsing (the chat panel keeps client-side parsing). */
  async parseFile(file: File): Promise<ParseFileResponse> {
    if (USE_MOCK) return mockParseFile(file);
    const fd = new FormData();
    fd.append("file", file);
    const row = await http<WireParsedFileResponse>("/api/v1/parse-file", {
      method: "POST",
      body: fd,
    });
    return wireParsedFileToUi(row);
  },

  async translate(req: TranslateRequest): Promise<TranslateResponse> {
    if (USE_MOCK) {
      return {
        translatedText: req.text,
        sourceLanguage: req.sourceLanguage ?? "en",
        targetLanguage: req.targetLanguage,
      };
    }
    const row = await http<WireTranslateResponse>("/api/v1/translate", {
      method: "POST",
      json: uiToWireTranslateRequest(req),
    });
    return wireTranslateResponseToUi(row);
  },

  async config(): Promise<AppConfig> {
    if (USE_MOCK) {
      return {
        languages: [
          { code: "en", label: "English" },
          { code: "fr", label: "French" },
          { code: "de", label: "German" },
          { code: "ro", label: "Romanian" },
          { code: "el", label: "Greek" },
        ],
        contentTypes: [
          { code: "article", label: "Article" },
          { code: "crm_email", label: "CRM Email" },
          { code: "push", label: "Push Notification" },
          { code: "social", label: "Social Post" },
        ],
      };
    }
    const row = await http<WireAppConfigResponse>("/api/v1/config");
    return wireAppConfigToUi(row);
  },

  health(): Promise<{ status: string }> {
    return http<{ status: string }>("/api/v1/health");
  },
};

async function* generateStream(
  req: GenerateRequest,
  signal?: AbortSignal,
): AsyncGenerator<GenerateChunk> {
  const stream = sse<WireStreamEvent>("/api/v1/generate", {
    json: uiToWireGenerateRequest(req),
    signal,
  });
  for await (const wire of stream) {
    const chunk = wireStreamEventToChunk(wire);
    if (chunk) yield chunk;
  }
}
