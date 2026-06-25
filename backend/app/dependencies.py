"""FastAPI dependency providers.

Lifecycle:
* `AnthropicClient`, `FileParserService`, `GenerationService`, and
  `TranslationService` are application-scoped singletons (one instance per
  process) — they're cheap to share and benefit from connection reuse.
* `SessionRepository` is request-scoped — it holds a transactional
  `AsyncSession` that must not be shared across requests.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db.base import get_session
from app.repositories.session_repository import SessionRepository
from app.services.anthropic_client import AnthropicClient
from app.services.file_parser import FileParserService
from app.services.generation import GenerationService
from app.services.translation import TranslationService


@lru_cache(maxsize=1)
def _build_anthropic_client(api_key: str, model: str) -> AnthropicClient:
    return AnthropicClient(api_key=api_key, default_model=model)


def get_anthropic_client(
    settings: Settings = Depends(get_settings),
) -> AnthropicClient:
    return _build_anthropic_client(settings.anthropic_api_key, settings.anthropic_model)


@lru_cache(maxsize=1)
def _file_parser_singleton() -> FileParserService:
    return FileParserService()


def get_file_parser_service() -> FileParserService:
    return _file_parser_singleton()


def get_generation_service(request: Request) -> GenerationService:
    """Return the app-scoped `GenerationService` created at startup."""
    service: GenerationService | None = getattr(request.app.state, "generation_service", None)
    if service is None:
        raise RuntimeError("GenerationService not initialized; check lifespan.")
    return service


def get_translation_service(request: Request) -> TranslationService:
    service: TranslationService | None = getattr(request.app.state, "translation_service", None)
    if service is None:
        raise RuntimeError("TranslationService not initialized; check lifespan.")
    return service


async def get_session_repository(
    db: AsyncSession = Depends(get_session),
) -> AsyncIterator[SessionRepository]:
    yield SessionRepository(db)
