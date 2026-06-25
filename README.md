# AI Content Generation & Translation Tool

An internal tool for generating and translating contents and documents(articles, CRM emails, push notifications, social posts). Built around a streaming chat surface for generation and a two-pane editor for translation, with a glossary-aware prompt layer and full audit logging.

## Overview

The product value is not the LLM call itself — it's the **prompt assembly**: composite system prompts built from versioned templates, with approved glossary terms and do-not-translate flags injected at request time. The model is treated as a commodity behind a provider-agnostic adapter, so Anthropic direct and AWS Bedrock are interchangeable.

The backend is a **modular monolith**: a single FastAPI deployment with cleanly separated service modules (generation, translation, document parsing) called in-process. This keeps deployment and operations simple while leaving clean seams to extract a module into its own service later if one genuinely needs independent scaling.

## Features

- **Content generation** — streaming chat UI with a language dropdown and a content-type chip (article / CRM email / push / social).
- **Multi-language translation** — two-pane layout (source left, tabbed targets right), with per-target regenerate and copy. Translates to N target languages in parallel.
- **Document upload** — parses `.txt`, `.md`, `.html`, and `.docx`, then pre-fills the source pane.
- **Placeholder preservation** — merge tags and HTML structure (e.g. `{{first_name}}`) are swapped for sentinel tokens before the LLM sees them and restored afterward, so variables and markup survive translation intact.
- **Glossary enforcement** — approved term translations and brand/product names that must not be translated are injected into every prompt.
- **Provider abstraction** — switch between Anthropic and Bedrock without touching service code.
- **Audit logging** — every request records who, when, prompt, output, provider, and token count. Non-negotiable for compliance.

## Architecture

```
┌─────────────┐      ┌──────────────────────┐      ┌─────────────────────────┐
│   UI (Next  │ SSE  │   API — FastAPI      │      │   Services (in-process) │
│   / React)  │─────▶│   /generate          │─────▶│   • Generation          │
│             │      │   /translate         │      │    • Translation         │
│  chat +     │      │   /parse-upload      │      │    • Document parser      │
│  translate  │◀─────│   auth + audit log   │◀─────│                         │
└─────────────┘      └──────────────────────┘      └───────────┬─────────────┘
                                                                │
                              ┌─────────────────────────────────┼───────────────┐
                              │                                  │               │
                       ┌──────▼──────┐                  ┌────────▼──────┐  ┌─────▼──────┐
                       │ LLM adapter │                  │ Prompt store  │  │  Glossary  │
                       │ Anthropic / │                  │ YAML in Git   │  │  MongoDB   │
                       │  Bedrock    │                  └───────────────┘  └────────────┘
                       └─────────────┘
```

### Layers

| Layer | Responsibility |
| --- | --- |
| **UI** | Thin React/Next.js app. Chat surface + translation surface, sharing one chat-history store. |
| **API** | FastAPI on EC2/ECS. Three endpoints, JWT/SSO auth, audit logging on every request. |
| **Services** | Generation, translation, and document parsing. Where the value lives. |
| **LLM adapter** | One class abstracting the provider. ~50 lines, saves a month of refactoring later. |
| **Prompt templates** | Versioned YAML files in Git, reviewed via PR. Loaded at startup, hot-reload in dev. |
| **Glossary store** | MongoDB collection of approved terms and do-not-translate flags. |

## Tech stack

- **Frontend:** Next.js / React (streaming chat, two-pane translation editor)
- **Backend:** FastAPI (async), Server-Sent Events for streaming
- **Datastore:** MongoDB (glossary + audit log)
- **LLM:** Claude via Anthropic direct or AWS Bedrock (Bedrock keeps data in your AWS footprint for audits)
- **Parsing:** `python-docx` (Word), BeautifulSoup (HTML)
- **Deployment:** EC2 / ECS

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/generate` | Generate content. Body: `{prompt, language, content_type, glossary_scope}`. Streams via SSE. |
| `POST` | `/translate` | Translate to N languages. Body: `{source_text, target_languages, format_hints}`. Streams each target. Returns `{lang: translation}`. |
| `POST` | `/parse-upload` | Parse an uploaded document. Returns extracted text + detected format. |

Auth via existing SSO or a simple JWT for internal-only use.

## Prompt templates

Prompts are code — they live in Git with PR review, not an admin UI (that comes in v2). YAML structure:

```yaml
# prompts/generate_crm_email.yaml
version: 2
system: |
  You are a CRM copywriter for {{brand}}, an iGaming operator...
  Tone: {{tone}}. Always include responsible gambling disclaimer.
  Target language: {{language}}.
  Use these approved terms: {{glossary_block}}
variables: [brand, tone, language, glossary_block]
```

Loaded at startup; hot-reloads on file change in dev.

## Glossary store

A MongoDB collection. At request time the relevant terms (by category or all) are injected as a bulleted block into the prompt, plus a do-not-translate flag list for brand and product names.

```json
{
  "_id": "...",
  "term_en": "free spins",
  "translations": { "es": "giros gratis", "it": "...", "pt": "..." },
  "category": "promo | compliance | product",
  "notes": "...",
  "do_not_translate": false,
  "created_by": "...",
  "updated_at": "..."
}
```

For v1, seed from a CSV. A CRUD admin page comes later.

## Setup

```bash
# 1. Clone and install
git clone <repo-url> && cd ai-content-tool
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Configure environment (see below)
cp .env.example .env

# 3. Seed the glossary
python scripts/seed_glossary.py glossary_seed.csv

# 4. Run the API
uvicorn app.main:app --reload

# 5. Run the UI
cd ui && npm install && npm run dev
```

### Environment variables

| Variable | Description |
| --- | --- |
| `LLM_PROVIDER` | `anthropic` or `bedrock` |
| `ANTHROPIC_API_KEY` | Required if provider is `anthropic` |
| `AWS_REGION` | Required if provider is `bedrock` |
| `MODEL_GENERATION` | Model for generation (Sonnet recommended) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` / `SSO_*` | Auth configuration |

> **Model choice:** use Sonnet for both generation and translation. Opus is overkill here and meaningfully more expensive per token.

## Scope

### In v1
Content generation, multi-language translation, document upload + parsing, placeholder preservation, glossary injection, provider abstraction, audit logging, basic auth.
