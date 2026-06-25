"""Persistence layer for chat sessions and messages.

Pure CRUD on top of SQLAlchemy 2.0 async APIs — no business logic, no Anthropic
calls. Methods return Pydantic schemas (the contract), not ORM rows.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import SessionNotFoundError
from app.db.models import ArtifactVersionORM, MessageORM, SessionORM
from app.schemas.enums import ArtifactVersionSource, Language
from app.schemas.session import (
    ArtifactVersion,
    Message,
    MessageCreate,
    Session,
    SessionCreate,
    SessionUpdate,
    SessionWithMessages,
)


class SessionRepository:
    """Thin async repository for sessions and their messages."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, data: SessionCreate) -> Session:
        """Insert a new session and return its Pydantic representation."""
        row = SessionORM(
            title=data.title or "New chat",
            content_type=data.content_type.value,
            language=data.language.value,
        )
        self.db.add(row)
        await self.db.flush()
        await self.db.refresh(row)
        return Session.model_validate(row)

    async def get(self, session_id: str) -> Session:
        """Fetch a session without messages.

        @throws SessionNotFoundError if no row matches.
        """
        row = await self._get_row(session_id)
        return Session.model_validate(row)

    async def get_with_messages(self, session_id: str) -> SessionWithMessages:
        """Fetch a session with its full message and version history.

        @throws SessionNotFoundError if no row matches.
        """
        row = await self._get_row(session_id)
        messages = [Message.model_validate(m) for m in row.messages]
        versions = [ArtifactVersion.model_validate(v) for v in row.artifact_versions]
        return SessionWithMessages(
            **Session.model_validate(row).model_dump(),
            messages=messages,
            artifact_versions=versions,
        )

    async def list_all(self, limit: int = 50) -> list[Session]:
        """Return sessions ordered by most-recent-update first."""
        stmt = (
            select(SessionORM)
            .order_by(SessionORM.updated_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return [Session.model_validate(r) for r in result.scalars().all()]

    async def update(self, session_id: str, data: SessionUpdate) -> Session:
        """Patch any subset of session fields.

        @throws SessionNotFoundError if no row matches.
        """
        row = await self._get_row(session_id)
        if data.title is not None:
            row.title = data.title
        if data.content_type is not None:
            row.content_type = data.content_type.value
        if data.language is not None:
            row.language = data.language.value
        if data.artifact is not None:
            row.artifact = data.artifact
        await self.db.flush()
        await self.db.refresh(row)
        return Session.model_validate(row)

    async def delete(self, session_id: str) -> None:
        """Hard-delete a session and its messages.

        @throws SessionNotFoundError if no row matches.
        """
        row = await self._get_row(session_id)
        await self.db.delete(row)
        await self.db.flush()

    async def append_message(self, session_id: str, message: MessageCreate) -> Message:
        """Append a message to a session and bump its `updated_at`.

        @throws SessionNotFoundError if no row matches.
        """
        session_row = await self._get_row(session_id)
        message_row = MessageORM(
            session_id=session_row.id,
            role=message.role.value,
            content=message.content,
            is_draft_trigger=message.is_draft_trigger,
        )
        self.db.add(message_row)
        await self.db.flush()
        await self.db.refresh(message_row)
        return Message.model_validate(message_row)

    async def list_messages(
        self,
        session_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Message]:
        """Paginated message listing for a single session.

        @throws SessionNotFoundError if no row matches.
        """
        await self._get_row(session_id)
        stmt = (
            select(MessageORM)
            .where(MessageORM.session_id == session_id)
            .order_by(MessageORM.created_at.asc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return [Message.model_validate(r) for r in result.scalars().all()]

    async def update_artifact(self, session_id: str, artifact: str) -> Session:
        """Persist the latest artifact draft.

        @throws SessionNotFoundError if no row matches.
        """
        return await self.update(session_id, SessionUpdate(artifact=artifact))

    async def add_artifact_version(
        self,
        session_id: str,
        content: str,
        language: Language,
        source: ArtifactVersionSource = ArtifactVersionSource.GENERATION,
    ) -> ArtifactVersion:
        """Append a new artifact version and refresh the session's denormalized snapshot.

        The version number is derived as `MAX(version) + 1` over the session's
        existing versions, so callers don't need to coordinate.

        @throws SessionNotFoundError if no session matches.
        """
        session_row = await self._get_row(session_id)

        next_version = await self._next_version_number(session_id)
        version_row = ArtifactVersionORM(
            session_id=session_row.id,
            version=next_version,
            content=content,
            language=language.value,
            source=source.value,
        )
        self.db.add(version_row)
        await self.db.flush()
        await self.db.refresh(version_row)

        # Keep `sessions.artifact` in sync as the latest snapshot.
        session_row.artifact = content
        await self.db.flush()

        return ArtifactVersion.model_validate(version_row)

    async def link_message_to_version(
        self,
        message_id: str,
        artifact_version_id: str,
    ) -> Message:
        """Associate an assistant message with the artifact version it produced.

        @throws SessionNotFoundError if no message matches (we reuse the same
            error class — the only caller is on the persistence path immediately
            after creating both rows, so a miss indicates a true server bug).
        """
        try:
            stmt = select(MessageORM).where(MessageORM.id == message_id)
            result = await self.db.execute(stmt)
            row = result.scalars().one()
        except NoResultFound as exc:
            raise SessionNotFoundError(f"Message {message_id} not found") from exc

        row.artifact_version_id = artifact_version_id
        await self.db.flush()
        await self.db.refresh(row)
        return Message.model_validate(row)

    async def _next_version_number(self, session_id: str) -> int:
        """Return MAX(version)+1 for the session, or 1 if none exist."""
        stmt = select(func.coalesce(func.max(ArtifactVersionORM.version), 0)).where(
            ArtifactVersionORM.session_id == session_id
        )
        current = (await self.db.execute(stmt)).scalar_one()
        return int(current) + 1

    async def _get_row(self, session_id: str) -> SessionORM:
        """Fetch the ORM row or raise.

        @throws SessionNotFoundError if no row matches.
        """
        try:
            stmt = select(SessionORM).where(SessionORM.id == session_id)
            result = await self.db.execute(stmt)
            return result.scalars().one()
        except NoResultFound as exc:
            raise SessionNotFoundError(f"Session {session_id} not found") from exc
