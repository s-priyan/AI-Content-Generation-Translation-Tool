"""Schemas for chat sessions and messages."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.enums import (
    ArtifactVersionSource,
    ContentType,
    Language,
    MessageRole,
)


class ArtifactVersion(BaseModel):
    """An immutable snapshot of a session's draft.

    A new version is created on every assistant turn that emits artifact
    deltas, and on translations or explicit edits.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    version: int
    content: str
    language: Language
    source: ArtifactVersionSource
    created_at: datetime


class Message(BaseModel):
    """A persisted chat message."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    role: MessageRole
    content: str
    created_at: datetime
    is_draft_trigger: bool = False
    # Set on assistant turns that produced a new artifact version. Lets the
    # frontend's "Draft ready" CTA jump straight to the right version.
    artifact_version_id: str | None = None


class MessageCreate(BaseModel):
    """Internal payload used by the repository to append a message."""

    role: MessageRole
    content: str
    is_draft_trigger: bool = False


class Session(BaseModel):
    """A persisted chat session (sidebar entry)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    content_type: ContentType
    language: Language
    # Latest version's body, denormalized for the sidebar / list endpoint.
    artifact: str | None = None
    created_at: datetime
    updated_at: datetime


class SessionWithMessages(Session):
    """Single-session detail response used by `GET /sessions/{id}`."""

    messages: list[Message] = Field(default_factory=list)
    artifact_versions: list[ArtifactVersion] = Field(default_factory=list)


class SessionCreate(BaseModel):
    """`POST /sessions` payload."""

    content_type: ContentType
    language: Language
    title: str | None = None


class SessionUpdate(BaseModel):
    """`PATCH /sessions/{id}` payload — every field optional."""

    title: str | None = None
    content_type: ContentType | None = None
    language: Language | None = None
    artifact: str | None = None
