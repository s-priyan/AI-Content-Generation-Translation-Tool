# AI Content Tool — Backend

FastAPI backend for the AI Content Generation & Translation Tool. Implements
the streaming `/generate` endpoint, file parsing via Docling, session
persistence, standalone translation, and a LangGraph-based generation agent.

## Quick start

```bash
cd backend

# 1. Create a virtualenv (any tool works; uv is recommended)
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# 2. Configure environment
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY

# 3. Run the API
uvicorn app.main:app --reload --port 8000
```

OpenAPI docs are at <http://localhost:8000/docs>. The frontend's `npm run gen:api`
consumes the schema served at <http://localhost:8000/openapi.json>.

## Layout

```
app/
├── api/v1/            # HTTP routers (generate, sessions, files, translate, config, health)
├── schemas/           # Pydantic models — the API contract
├── services/          # Business logic (Anthropic, prompts, agent, parsers)
├── repositories/      # Persistence layer (SQLAlchemy)
├── db/                # Engine, models, Declarative base
├── core/              # Logging, exceptions, constants
├── config.py          # Settings (pydantic-settings)
├── dependencies.py    # FastAPI Depends() providers
└── main.py            # App factory, CORS, exception handlers
```

## Tests

```bash
pytest
```

Unit tests cover the stream parser, prompt builder, and session repository.
The repository tests run against an in-memory SQLite database.

## Notes

* The agent uses LangGraph's `StateGraph`. See `services/generation_graph.py`.
* Streaming uses an `asyncio.Queue` carried inside agent state — the
  orchestrator drives the graph in a task and yields events as they arrive.
* Docling is initialized lazily so the app starts fast and tests can mock it.
* Database migrations are not wired up yet; `init_db()` calls
  `Base.metadata.create_all` on startup. Add Alembic before production.
