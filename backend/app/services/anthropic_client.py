"""Async wrapper over the Anthropic SDK.

Two methods are exposed:

* `stream_messages` — async iterator over text deltas. Used by every node that
  produces token-level streamed output.
* `complete` — single-shot, non-streaming. Used by the intent classifier and
  the translation service.

The wrapper centralizes:
* model/temperature defaults,
* retry-with-backoff on transient failures,
* token-usage logging.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from anthropic import (
    APIConnectionError,
    APIStatusError,
    AsyncAnthropic,
    RateLimitError,
)
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.exceptions import AnthropicAPIError
from app.core.logging import get_logger

logger = get_logger(__name__)

_RETRY_EXCEPTIONS = (RateLimitError, APIConnectionError)


class AnthropicClient:
    """Thin async client around `anthropic.AsyncAnthropic`."""

    def __init__(self, api_key: str, default_model: str) -> None:
        self._client = AsyncAnthropic(api_key=api_key)
        self._default_model = default_model

    @property
    def default_model(self) -> str:
        return self._default_model

    async def stream_messages(
        self,
        messages: list[dict[str, Any]],
        system: str,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        """Yield text deltas as Anthropic streams them.

        @throws AnthropicAPIError on irrecoverable upstream failures.
        """
        target_model = model or self._default_model
        try:
            async with self._client.messages.stream(
                model=target_model,
                system=system,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            ) as stream:
                async for chunk in stream.text_stream:
                    if chunk:
                        yield chunk

                final_message = await stream.get_final_message()
                if final_message.usage:
                    logger.info(
                        "anthropic stream usage model=%s input=%s output=%s",
                        target_model,
                        final_message.usage.input_tokens,
                        final_message.usage.output_tokens,
                    )
        except APIStatusError as exc:
            logger.error("anthropic stream error status=%s body=%s", exc.status_code, exc.body)
            raise AnthropicAPIError(f"Anthropic API error: {exc.message}") from exc
        except _RETRY_EXCEPTIONS as exc:
            logger.error("anthropic stream transient error: %s", exc)
            raise AnthropicAPIError("Anthropic API connection error") from exc

    async def complete(
        self,
        messages: list[dict[str, Any]],
        system: str,
        model: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.0,
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Single-shot, non-streaming completion with retry.

        Returns a dict with `text` and optional `tool_use` (dict of tool input)
        so callers don't depend on Anthropic SDK types.

        @throws AnthropicAPIError on irrecoverable upstream failures.
        """
        target_model = model or self._default_model
        kwargs: dict[str, Any] = {
            "model": target_model,
            "system": system,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if tools:
            kwargs["tools"] = tools

        try:
            async for attempt in AsyncRetrying(
                reraise=True,
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=0.5, min=0.5, max=4.0),
                retry=retry_if_exception_type(_RETRY_EXCEPTIONS),
            ):
                with attempt:
                    response = await self._client.messages.create(**kwargs)
        except RetryError as exc:
            logger.error("anthropic complete retries exhausted: %s", exc)
            raise AnthropicAPIError("Anthropic API retries exhausted") from exc
        except APIStatusError as exc:
            logger.error("anthropic complete error status=%s body=%s", exc.status_code, exc.body)
            raise AnthropicAPIError(f"Anthropic API error: {exc.message}") from exc

        if response.usage:
            logger.info(
                "anthropic complete usage model=%s input=%s output=%s",
                target_model,
                response.usage.input_tokens,
                response.usage.output_tokens,
            )

        text_chunks: list[str] = []
        tool_use: dict[str, Any] | None = None
        for block in response.content:
            block_type = getattr(block, "type", None)
            if block_type == "text":
                text_chunks.append(block.text)
            elif block_type == "tool_use":
                tool_use = {
                    "name": block.name,
                    "input": block.input,
                }

        return {
            "text": "".join(text_chunks),
            "tool_use": tool_use,
            "stop_reason": response.stop_reason,
        }
