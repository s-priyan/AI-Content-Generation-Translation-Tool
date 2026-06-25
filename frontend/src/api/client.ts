/**
 * Infrastructure layer for backend HTTP calls.
 * Changes when base URL / auth / retries / timeouts change.
 */
import type { WireApiErrorBody } from "./wire";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface HttpInit extends Omit<RequestInit, "body"> {
  json?: unknown;
  body?: BodyInit | null;
}

/**
 * Issue a JSON request. Honours the backend's documented error envelope
 * `{ error: { code, message, details } }` and surfaces it via `ApiError`.
 */
export async function http<T>(path: string, init?: HttpInit): Promise<T> {
  const { json, headers, body, ...rest } = init ?? {};
  const isFormData = body instanceof FormData;

  const finalHeaders: HeadersInit = {
    Accept: "application/json",
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: json !== undefined ? JSON.stringify(json) : (body ?? undefined),
  });

  if (!res.ok) throw await buildApiError(res, path);

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Streams an SSE response, yielding one parsed JSON chunk per `data:` line.
 * Each chunk should already be a typed value matching the caller's expectation.
 */
export async function* sse<TChunk>(
  path: string,
  init?: HttpInit & { signal?: AbortSignal },
): AsyncGenerator<TChunk> {
  const { json, headers, signal, body, ...rest } = init ?? {};
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    method: rest.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : (body ?? undefined),
    signal,
  });

  if (!res.ok || !res.body) throw await buildApiError(res, path);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            yield JSON.parse(payload) as TChunk;
          } catch {
            // ignore malformed line
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function buildApiError(res: Response, path: string): Promise<ApiError> {
  const fallback = `${res.status} ${res.statusText} — ${path}`;
  const text = await res.text().catch(() => "");
  if (!text) return new ApiError(fallback, res.status);

  try {
    const parsed = JSON.parse(text) as Partial<WireApiErrorBody>;
    if (parsed?.error?.message) {
      return new ApiError(
        parsed.error.message,
        res.status,
        parsed.error.code,
        parsed.error.details,
      );
    }
  } catch {
    // not JSON — fall through
  }
  return new ApiError(fallback, res.status, undefined, text);
}
