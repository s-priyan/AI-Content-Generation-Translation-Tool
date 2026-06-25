"""Standalone translation service for `POST /api/v1/translate`.

Single Claude call, no LangGraph — translation has different prompt logic and
different streaming requirements (small payload, returned non-streamed).
"""

from __future__ import annotations

from app.core.exceptions import AnthropicAPIError
from app.core.logging import get_logger
from app.schemas.enums import Language
from app.schemas.translate import TranslateRequest, TranslateResponse
from app.services.anthropic_client import AnthropicClient
from app.services.prompt_builder import build_standalone_translate_prompt

logger = get_logger(__name__)


class TranslationService:
    """Synchronous (non-SSE) translator built on top of `AnthropicClient`."""

    def __init__(self, anthropic_client: AnthropicClient) -> None:
        self._client = anthropic_client

    async def translate(self, request: TranslateRequest) -> TranslateResponse:
        """Translate `request.text` to `request.target_language`.

        @throws AnthropicAPIError on upstream failures.
        """
        system = build_standalone_translate_prompt(
            target_language=request.target_language,
            preserve_formatting=request.preserve_formatting,
        )

        try:
            result = await self._client.complete(
                system=system,
                messages=[{"role": "user", "content": request.text}],
                max_tokens=4096,
                temperature=0.0,
            )
        except AnthropicAPIError:
            raise

        translated = (result.get("text") or "").strip()
        return TranslateResponse(
            translated_text=translated,
            source_language=request.source_language or Language.EN,
            target_language=request.target_language,
        )
