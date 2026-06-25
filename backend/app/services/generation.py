"""High-level orchestrator for `/api/v1/generate`.

Bridges the LangGraph agent (which writes `StreamEvent`s into a queue) with
the FastAPI streaming response (which reads them and serializes to SSE).

Persistence (appending the user message and the assistant artifact) happens
once the graph finishes successfully.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import Settings
from app.core.exceptions import AppException
from app.core.logging import get_logger
from app.repositories.session_repository import SessionRepository
from app.schemas.enums import ArtifactVersionSource, MessageRole, StreamEventType
from app.schemas.generate import GenerateRequest, MessageInput, StreamEvent
from app.schemas.session import ArtifactVersion, MessageCreate, SessionUpdate
from app.services.anthropic_client import AnthropicClient
from app.services.generation_graph import (
    AgentState,
    build_generation_graph,
    build_initial_state,
)

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class _PersistedVersion:
    """Internal pair returned by `_persist_outcome` so `stream_generate` can
    emit a `VERSION_CREATED` SSE event with the right ids."""

    id: str
    version: int
    message_id: str


class GenerationService:
    """Streams content generation through the LangGraph agent."""

    def __init__(
        self,
        anthropic_client: AnthropicClient,
        sessionmaker: async_sessionmaker,
        settings: Settings,
    ) -> None:
        self._client = anthropic_client
        self._sessionmaker = sessionmaker
        self._settings = settings
        self._graph = build_generation_graph(anthropic_client)

    async def stream_generate(
        self,
        request: GenerateRequest,
    ) -> AsyncIterator[StreamEvent]:
        """Yield SSE-bound `StreamEvent`s for the lifetime of one generation run.

        The contract:
        * Always ends with a `DONE` event on success or an `ERROR` event on failure.
        * Persists the new user message and resulting artifact only on success.
        """
        await self._persist_incoming_user_message(request)

        queue: asyncio.Queue[StreamEvent | None] = asyncio.Queue()

        capped_messages = self._cap_history(request.messages)
        initial_state = build_initial_state(
            messages=capped_messages,
            content_type=request.content_type,
            language=request.language,
            current_artifact=request.current_artifact,
            uploaded_file_text=request.uploaded_file_text,
            stream_queue=queue,
        )

        graph_task: asyncio.Task[Any] = asyncio.create_task(
            self._run_graph(initial_state, queue),
        )

        final_state: AgentState | None = None
        terminal_error: StreamEvent | None = None

        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                if event.type is StreamEventType.ERROR:
                    terminal_error = event
                yield event
        finally:
            try:
                final_state = await graph_task
            except Exception as exc:  # noqa: BLE001
                logger.exception("graph task raised after queue closed")
                if terminal_error is None:
                    terminal_error = StreamEvent(
                        type=StreamEventType.ERROR,
                        data=str(exc),
                        error_code="AGENT_ERROR",
                    )

        if terminal_error is None and final_state is not None:
            persisted_version = await self._persist_outcome(request, final_state)
            if persisted_version is not None:
                yield StreamEvent(
                    type=StreamEventType.VERSION_CREATED,
                    artifact_version_id=persisted_version.id,
                    artifact_version=persisted_version.version,
                    artifact_message_id=persisted_version.message_id,
                )
            yield StreamEvent(type=StreamEventType.DONE)
        elif terminal_error is not None:
            # The error event was already yielded inside the loop.
            yield StreamEvent(type=StreamEventType.DONE)

    async def _run_graph(
        self,
        initial_state: AgentState,
        queue: asyncio.Queue[StreamEvent | None],
    ) -> AgentState | None:
        """Drive the LangGraph agent and signal completion to the queue."""
        try:
            final_state: AgentState = await self._graph.ainvoke(initial_state)
            return final_state
        except AppException as exc:
            logger.warning("agent app error: %s", exc.code)
            await queue.put(
                StreamEvent(
                    type=StreamEventType.ERROR,
                    data=exc.message,
                    error_code=exc.code,
                )
            )
            return None
        except Exception as exc:  # noqa: BLE001
            logger.exception("agent unexpected error")
            await queue.put(
                StreamEvent(
                    type=StreamEventType.ERROR,
                    data=str(exc),
                    error_code="AGENT_ERROR",
                )
            )
            return None
        finally:
            await queue.put(None)

    async def _persist_incoming_user_message(self, request: GenerateRequest) -> None:
        """Store the latest user message before kicking off generation."""
        last_user = next(
            (m for m in reversed(request.messages) if m.role == MessageRole.USER),
            None,
        )
        if last_user is None:
            return

        async with self._sessionmaker() as db:
            try:
                repo = SessionRepository(db)
                await repo.append_message(
                    request.session_id,
                    MessageCreate(
                        role=last_user.role,
                        content=last_user.content,
                        is_draft_trigger=True,
                    ),
                )
                await db.commit()
            except AppException:
                await db.rollback()
                raise
            except Exception:
                await db.rollback()
                logger.exception("failed to persist incoming user message")

    async def _persist_outcome(
        self,
        request: GenerateRequest,
        final_state: AgentState,
    ) -> _PersistedVersion | None:
        """Persist the assistant's chat message and (if any) a new artifact version.

        Returns the persisted-version descriptor when one was created so the
        caller can emit a `VERSION_CREATED` SSE event. Chat-only turns return
        `None`.
        """
        final = final_state.get("final_output")
        if final is None:
            return None

        produced_artifact = bool(final.artifact and final.artifact.strip())

        async with self._sessionmaker() as db:
            try:
                repo = SessionRepository(db)
                assistant_msg = await repo.append_message(
                    request.session_id,
                    MessageCreate(
                        role=MessageRole.ASSISTANT,
                        content=final.chat_message,
                        is_draft_trigger=False,
                    ),
                )

                version: ArtifactVersion | None = None
                if produced_artifact:
                    version = await repo.add_artifact_version(
                        session_id=request.session_id,
                        content=final.artifact,
                        language=request.language,
                        source=ArtifactVersionSource.GENERATION,
                    )
                    await repo.link_message_to_version(assistant_msg.id, version.id)

                title_update = (
                    self._derive_title(request, final.artifact) if produced_artifact else None
                )
                if title_update is not None:
                    await repo.update(
                        request.session_id,
                        SessionUpdate(title=title_update),
                    )

                await db.commit()

                if version is None:
                    return None
                return _PersistedVersion(
                    id=version.id,
                    version=version.version,
                    message_id=assistant_msg.id,
                )
            except Exception:
                await db.rollback()
                logger.exception("failed to persist generation outcome")
                return None

    def _derive_title(self, request: GenerateRequest, artifact: str) -> str | None:
        """Generate a short title for the sidebar from the first user message."""
        first_user = next(
            (m for m in request.messages if m.role == MessageRole.USER),
            None,
        )
        if first_user is None:
            return None
        title = first_user.content.strip().splitlines()[0]
        if len(title) > 60:
            title = title[:57].rstrip() + "…"
        return title or None

    def _cap_history(self, messages: list[MessageInput]) -> list[MessageInput]:
        """Trim message history to the configured maximum to bound prompt size."""
        cap = self._settings.max_message_history
        if len(messages) <= cap:
            return messages
        return messages[-cap:]
