## **Backend Implementation Specification — AI Content Generation & Translation Tool**

A specification structured for LLM-driven implementation. Every section defines **what to build**, **why it exists**, and **the exact contract** so an implementing model has zero ambiguity.

---

### **1\. Stack & Conventions**

| Concern | Choice | Notes |
| ----- | ----- | ----- |
| Web framework | FastAPI | Async-first, auto OpenAPI |
| Agent orchestration | LangGraph | StateGraph for multi-step agents |
| LLM | Claude (Anthropic SDK) | Model: `claude-sonnet-4-5` (configurable via env) |
| File parsing | Docling | PDF, DOCX, PPTX, HTML, images |
| Validation & contracts | Pydantic v2 | All requests, responses, agent outputs |
| Persistence | SQLAlchemy 2.0 (async) \+ SQLite (dev) / Postgres (prod) | Sessions, messages, artifacts |
| Concurrency | `async`/`await` end-to-end | No blocking calls in request path |
| Config | `pydantic-settings` reading `.env` | `ANTHROPIC_API_KEY` lives here |

**Async rule:** every route handler, service method, and repository method is `async def`. CPU-bound work (Docling parsing) runs via `asyncio.to_thread` to avoid blocking the event loop. Streaming uses FastAPI's `StreamingResponse` with an async generator.

---

### **2\. Endpoint Inventory**

Derived from the product scope (chat UI, session history, artifact generation, refinement, file upload, translation). All endpoints are versioned under `/api/v1`.

#### **Core endpoints**

| Method | Path | Purpose |
| ----- | ----- | ----- |
| `POST` | `/api/v1/generate` | Stream LLM response — first draft or refinement. Returns SSE. |
| `POST` | `/api/v1/parse-file` | Parse uploaded file via Docling, return extracted text. |
| `GET` | `/api/v1/sessions` | List all chat sessions (sidebar). |
| `POST` | `/api/v1/sessions` | Create a new session. |
| `GET` | `/api/v1/sessions/{session_id}` | Fetch one session with messages and artifact. |
| `PATCH` | `/api/v1/sessions/{session_id}` | Update title, language, or content type. |
| `DELETE` | `/api/v1/sessions/{session_id}` | Delete a session. |
| `GET` | `/api/v1/sessions/{session_id}/messages` | Paginated messages for a session. |
| `POST` | `/api/v1/translate` | Standalone artifact translation (separate from generate). |
| `GET` | `/api/v1/health` | Liveness probe. |
| `GET` | `/api/v1/config` | Returns supported languages \+ content types (for UI population). |

#### **Why these and not others**

* **No `/upload` separate from `/parse-file`** — the file's only purpose is its extracted text, which is then injected into the next `/generate` call. No need to persist the binary.  
* **`/translate` is separate from `/generate`** because translation has different prompt logic (preserve formatting, no creative drift) and different streaming requirements (translation is shorter, can return non-streamed).  
* **`/config` exists** so the frontend's language dropdown and content-type chips are server-driven — adding a new language doesn't require a frontend deploy.

---

### **3\. Pydantic Schemas (the API contract)**

These are the source of truth. FastAPI generates OpenAPI from them; the frontend's `types.gen.ts` is generated from that.

#### **`schemas/enums.py`**

python

```py
from enum import Enum

class ContentType(str, Enum):
    ARTICLE = "article"
    CRM_EMAIL = "crm_email"
    PUSH = "push"
    SOCIAL = "social"

class Language(str, Enum):
    EN = "en"
    FR = "fr"
    DE = "de"
    RO = "ro"
    EL = "el"
    # extend via config

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"

class StreamEventType(str, Enum):
    CHAT_DELTA = "chat_delta"        # token going to chat panel
    ARTIFACT_DELTA = "artifact_delta"  # token going to artifact panel
    ARTIFACT_COMPLETE = "artifact_complete"
    DONE = "done"
    ERROR = "error"
```

#### **`schemas/generate.py`**

python

```py
from pydantic import BaseModel, Field
from .enums import ContentType, Language, MessageRole, StreamEventType

class MessageInput(BaseModel):
    role: MessageRole
    content: str

class GenerateRequest(BaseModel):
    session_id: str
    content_type: ContentType
    language: Language
    messages: list[MessageInput]              # full conversation history
    current_artifact: str | None = None       # latest draft, if any
    uploaded_file_text: str | None = None     # injected from /parse-file

class StreamEvent(BaseModel):
    type: StreamEventType
    data: str | None = None
    error_code: str | None = None
```

#### **`schemas/agent_output.py` — structured output from the agent**

This is what the LangGraph agent **must** return at the end of its run. Pydantic validates it.

python

```py
class GeneratedContent(BaseModel):
    """Final structured output from the generation agent."""
    artifact: str = Field(..., description="The full content draft")
    chat_message: str = Field(..., description="Short conversational note to show in chat")
    language: Language
    content_type: ContentType
    word_count: int
    metadata: dict = Field(default_factory=dict)  # tone, reading level, etc.
```

#### **`schemas/session.py`**

python

```py
from datetime import datetime

class Message(BaseModel):
    id: str
    session_id: str
    role: MessageRole
    content: str
    created_at: datetime
    is_draft_trigger: bool = False

class Session(BaseModel):
    id: str
    title: str
    content_type: ContentType
    language: Language
    artifact: str | None
    created_at: datetime
    updated_at: datetime

class SessionWithMessages(Session):
    messages: list[Message]

class SessionCreate(BaseModel):
    content_type: ContentType
    language: Language

class SessionUpdate(BaseModel):
    title: str | None = None
    content_type: ContentType | None = None
    language: Language | None = None
```

#### **`schemas/files.py`**

python

```py
class ParsedFileResponse(BaseModel):
    filename: str
    text: str
    page_count: int | None = None
    word_count: int
    mime_type: str
```

#### **`schemas/translate.py`**

python

```py
class TranslateRequest(BaseModel):
    text: str
    target_language: Language
    preserve_formatting: bool = True

class TranslateResponse(BaseModel):
    translated_text: str
    source_language: Language
    target_language: Language
```

---

### **4\. LangGraph Agent Design**

Use LangGraph's `StateGraph` because content generation is multi-step: **understand intent → generate or refine → validate structure → emit**. A single Anthropic call would work for simple cases but breaks down on refinement (which needs the previous artifact in context) and on translation requests embedded in chat ("translate this to French").

#### **Agent state**

python

```py
from typing import TypedDict, Annotated
from operator import add

class AgentState(TypedDict):
    messages: list[MessageInput]
    content_type: ContentType
    language: Language
    current_artifact: str | None
    uploaded_file_text: str | None
    
    # populated as graph runs
    intent: str | None              # "generate" | "refine" | "translate"
    draft_artifact: str | None
    chat_message: str | None
    final_output: GeneratedContent | None
    error: str | None
```

#### **Graph topology**

```
[entry]
   ↓
classify_intent  ← Claude call: "is the user asking for new content, refinement, or translation?"
   ↓
   ├─→ generate_node   (if intent == "generate")
   ├─→ refine_node     (if intent == "refine")
   └─→ translate_node  (if intent == "translate")
   ↓
validate_output  ← parse Claude's structured output, retry once if invalid
   ↓
[end]
```

#### **Node responsibilities**

**`classify_intent`** — single short Claude call returning `{"intent": "generate" | "refine" | "translate"}`. Uses Anthropic's tool-use feature for structured output. No streaming.

**`generate_node`** — first draft. Uses content-type-specific prompt template. Streams output back through callbacks.

**`refine_node`** — receives `current_artifact` \+ latest user message. Prompts Claude to rewrite the artifact based on the instruction. Streams.

**`translate_node`** — receives `current_artifact` \+ target language. Prompts Claude to translate while preserving structure. Streams.

**`validate_output`** — parses the streamed response into `GeneratedContent`. If parsing fails (missing `<artifact>` tags, malformed structure), retries once with an error correction prompt.

#### **Why LangGraph here, not plain SDK**

* **Conditional routing** — intent classification cleanly fans out to specialized nodes without `if/else` mess in service code.  
* **Retry on validation failure** — encoded as a graph edge, not a try/except block.  
* **Future-proof** — adding a "summarize" or "fact-check" node later means one new node \+ one new edge, not refactoring service code.

---

### **5\. Streaming Strategy**

The frontend needs **two streams** — chat tokens (right side, conversational reply) and artifact tokens (left side, the draft) — multiplexed over a single SSE connection.

#### **Wire format**

Each SSE event is a JSON-encoded `StreamEvent`:

```
event: message
data: {"type": "artifact_delta", "data": "Once upon"}

event: message
data: {"type": "artifact_delta", "data": " a time"}

event: message
data: {"type": "chat_delta", "data": "Here's your draft. "}

event: message
data: {"type": "artifact_complete", "data": null}

event: message
data: {"type": "done", "data": null}
```

#### **How tokens are routed**

The agent's prompt instructs Claude to wrap artifact content in `<artifact>...</artifact>` tags. The streaming parser reads tokens as they arrive:

* Tokens **inside** `<artifact>` tags → emit as `artifact_delta`.  
* Tokens **outside** `<artifact>` tags → emit as `chat_delta`.  
* On `</artifact>` close → emit `artifact_complete`.  
* After the final token → emit `done`.

This logic lives in `services/stream_parser.py` and runs inside the async generator that feeds `StreamingResponse`.

---

### **6\. Service Layer Logic**

#### **`services/anthropic_client.py`**

Thin wrapper around `anthropic.AsyncAnthropic`. Loads API key from settings. Exposes:

* `async def stream_messages(messages, system, model, max_tokens) -> AsyncIterator[str]`  
* `async def complete(messages, system, model, tools=None) -> dict` (non-streaming, used by `classify_intent`)

Includes retry-with-backoff on `RateLimitError` and `APIConnectionError`. Logs token usage per call.

#### **`services/prompt_builder.py`**

Pure functions, no I/O. Returns system prompts as strings.

python

```py
def build_generate_prompt(content_type: ContentType, language: Language) -> str: ...
def build_refine_prompt(content_type: ContentType, language: Language) -> str: ...
def build_translate_prompt(target_language: Language) -> str: ...
def build_intent_classification_prompt() -> str: ...
```

Each template instructs Claude on:

* Output format (`<artifact>` tags \+ chat message after)  
* Content-type-specific rules (CRM email needs subject \+ body; push needs ≤140 chars; article needs structure)  
* Language requirements

#### **`services/file_parser.py` — Docling integration**

python

```py
from docling.document_converter import DocumentConverter
import asyncio

class FileParserService:
    def __init__(self):
        self._converter = DocumentConverter()
    
    async def parse(self, file_bytes: bytes, filename: str) -> ParsedFileResponse:
        # Docling is sync and CPU-bound; offload to thread
        result = await asyncio.to_thread(
            self._convert_sync, file_bytes, filename
        )
        return result
    
    def _convert_sync(self, file_bytes: bytes, filename: str) -> ParsedFileResponse:
        # Write to temp file (Docling needs a path), convert, extract markdown
        ...
```

**Why `asyncio.to_thread`:** Docling does heavy parsing (OCR, layout analysis) that would block the event loop. Threading isolates it. For very large files or high concurrency, switch to a task queue (Celery, ARQ) — but not in MVP.

#### **`services/generation.py` — the orchestrator**

python

```py
class GenerationService:
    def __init__(self, anthropic_client, session_repo):
        self.graph = build_generation_graph(anthropic_client)  # LangGraph compiled graph
        self.session_repo = session_repo
    
    async def stream_generate(
        self, request: GenerateRequest
    ) -> AsyncIterator[StreamEvent]:
        # 1. Build initial agent state from request
        # 2. Run graph with streaming callbacks
        # 3. As tokens arrive, route via stream_parser to chat or artifact channel
        # 4. Yield StreamEvent objects
        # 5. On completion, persist final artifact + messages via session_repo
        ...
```

#### **`services/translation.py`**

Simpler than generation — single Claude call, no graph. Used by `/translate` endpoint for standalone translation.

---

### **7\. Repository Layer**

python

```py
class SessionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create(self, data: SessionCreate) -> Session: ...
    async def get(self, session_id: str) -> Session | None: ...
    async def get_with_messages(self, session_id: str) -> SessionWithMessages | None: ...
    async def list_all(self, limit: int = 50) -> list[Session]: ...
    async def update(self, session_id: str, data: SessionUpdate) -> Session: ...
    async def delete(self, session_id: str) -> None: ...
    async def append_message(self, session_id: str, message: Message) -> None: ...
    async def update_artifact(self, session_id: str, artifact: str) -> None: ...
```

Uses SQLAlchemy 2.0 async patterns. All methods are awaitable. No business logic — just persistence.

---

### **8\. Route Handlers (HTTP Layer)**

Routes do **only** four things: validate input, call a service, handle errors, return response. No logic.

#### **`api/v1/generate.py`**

python

```py
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/generate", tags=["generation"])

@router.post("")
async def generate(
    request: GenerateRequest,
    service: GenerationService = Depends(get_generation_service),
):
    async def event_stream():
        async for event in service.stream_generate(request):
            yield f"event: message\ndata: {event.model_dump_json()}\n\n"
    
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

#### **`api/v1/files.py`**

python

```py
@router.post("/parse-file", response_model=ParsedFileResponse)
async def parse_file(
    file: UploadFile,
    service: FileParserService = Depends(get_file_parser_service),
):
    if file.size > MAX_FILE_SIZE:
        raise HTTPException(413, "File too large")
    contents = await file.read()
    return await service.parse(contents, file.filename)
```

#### **`api/v1/sessions.py`**

Standard REST CRUD. Each handler is 3-5 lines: validate, call repository, return.

#### **`api/v1/translate.py`**

Non-streaming endpoint. Takes `TranslateRequest`, returns `TranslateResponse`. Uses `TranslationService`.

#### **`api/v1/config.py`**

python

```py
@router.get("/config")
async def get_config():
    return {
        "languages": [{"code": l.value, "label": LANGUAGE_LABELS[l]} for l in Language],
        "content_types": [{"code": c.value, "label": CONTENT_TYPE_LABELS[c]} for c in ContentType],
    }
```

---

### **9\. Configuration**

#### **`app/config.py`**

python

```py
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    anthropic_api_key: str = Field(..., alias="ANTHROPIC_API_KEY")
    anthropic_model: str = "claude-sonnet-4-5"
    database_url: str = "sqlite+aiosqlite:///./app.db"
    cors_origins: list[str] = ["http://localhost:3000"]
    max_file_size_mb: int = 20
    max_message_history: int = 50  # cap context sent to Claude
    
    model_config = {"env_file": ".env", "extra": "ignore"}

settings = Settings()
```

#### **`.env`**

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5
DATABASE_URL=sqlite+aiosqlite:///./app.db
CORS_ORIGINS=["http://localhost:3000"]
```

#### **`app/main.py`**

python

```py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: init DB, warm Docling
    await init_db()
    yield
    # Shutdown: close connections
    await close_db()

app = FastAPI(title="AI Content Tool", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, ...)
app.include_router(api_router, prefix="/api/v1")
```

---

### **10\. Async Discipline (rules the implementation must follow)**

1. **Every route handler is `async def`.** No exceptions.  
2. **Every service method that does I/O is `async def`.** Pure functions stay sync.  
3. **CPU-bound work** (Docling parsing, large JSON serialization) uses `asyncio.to_thread`.  
4. **Database calls** use SQLAlchemy's `AsyncSession` — never the sync `Session`.  
5. **Anthropic calls** use `AsyncAnthropic`, never the sync `Anthropic` client.  
6. **Streaming generators** use `async for`, not `for`.  
7. **No `time.sleep`** — always `await asyncio.sleep`.  
8. **Background tasks** (logging, analytics) use `BackgroundTasks` so they don't block the response.

---

### **11\. Error Handling Contract**

Custom exception hierarchy in `core/exceptions.py`:

python

```py
class AppException(Exception):
    code: str
    status_code: int = 500

class AnthropicAPIError(AppException):
    code = "ANTHROPIC_ERROR"
    status_code = 502

class FileParsingError(AppException):
    code = "FILE_PARSE_ERROR"
    status_code = 422

class SessionNotFoundError(AppException):
    code = "SESSION_NOT_FOUND"
    status_code = 404

class AgentValidationError(AppException):
    code = "AGENT_VALIDATION_ERROR"
    status_code = 502
```

Global exception handler in `main.py` maps these to JSON responses:

json

```json
{"error": {"code": "ANTHROPIC_ERROR", "message": "..."}}
```

The frontend `client.ts` reads `error.code` and surfaces the right UI state. **Codes are stable**, messages can change.

---

### **12\. Implementation Order**

For an LLM building this end-to-end, this is the dependency-correct order:

1. `config.py`, `core/exceptions.py`, `core/logging.py`  
2. All Pydantic schemas (`schemas/*.py`)  
3. Database models \+ repositories  
4. `services/anthropic_client.py`, `services/prompt_builder.py`  
5. `services/file_parser.py` (Docling)  
6. LangGraph agent (`services/generation_graph.py`)  
7. `services/generation.py` (orchestrator)  
8. `services/translation.py`  
9. `services/stream_parser.py`  
10. Routers (`api/v1/*.py`) — last, because they only wire things together  
11. `main.py` — assembles the app  
12. Tests (unit on services, integration on routes)

