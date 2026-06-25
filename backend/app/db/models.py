"""SQLAlchemy ORM models.

Pydantic schemas in `app/schemas/` are the API contract; these are the
storage representation. The repository layer translates between them.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _new_id() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SessionORM(Base):
    """A chat session — sidebar entry holding an evolving artifact across versions."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="New chat")
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    language: Mapped[str] = mapped_column(String(8), nullable=False)
    # Denormalized snapshot of the latest artifact version's body so the sidebar
    # and `GET /sessions` stay cheap. Authoritative history lives in
    # `artifact_versions`.
    artifact: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    messages: Mapped[list[MessageORM]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="MessageORM.created_at",
        lazy="selectin",
    )

    artifact_versions: Mapped[list[ArtifactVersionORM]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ArtifactVersionORM.version",
        lazy="selectin",
    )


class MessageORM(Base):
    """A single chat message belonging to a session."""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_draft_trigger: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Set when this assistant turn produced a new artifact version. Nullable
    # for chat-only turns and for user messages.
    artifact_version_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("artifact_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
    )

    session: Mapped[SessionORM] = relationship(back_populates="messages")


class ArtifactVersionORM(Base):
    """An immutable snapshot of the session's draft at a point in time.

    A new version is created whenever the assistant emits artifact deltas
    (initial generation or refinement) and may also be created later by
    translation or explicit edit-as-new-version flows.
    """

    __tablename__ = "artifact_versions"
    __table_args__ = (
        UniqueConstraint("session_id", "version", name="uq_artifact_versions_session_version"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # 1-based monotonically increasing within a session.
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(8), nullable=False)
    # "generation" | "translation" | "edit"
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="generation")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
    )

    session: Mapped[SessionORM] = relationship(back_populates="artifact_versions")
