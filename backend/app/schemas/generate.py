"""Schemas for the streaming generation endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.enums import ContentType, Language, MessageRole, StreamEventType


class MessageInput(BaseModel):
    """A single chat message supplied as input to the generation agent."""

    role: MessageRole
    content: str = Field(..., min_length=1)


class GenerateRequest(BaseModel):
    """Request body for `POST /api/v1/generate`."""

    session_id: str = Field(..., min_length=1)
    content_type: ContentType
    language: Language
    messages: list[MessageInput] = Field(..., min_length=1)
    current_artifact: str | None = None
    uploaded_file_text: str | None = None


class StreamEvent(BaseModel):
    """One SSE message emitted by the generation stream.

    `data` carries chat or artifact text deltas; the artifact-version fields
    are populated only on the `version_created` marker emitted right before
    `done` whenever a new artifact version was persisted.
    """

    type: StreamEventType
    data: str | None = None
    error_code: str | None = None
    artifact_version_id: str | None = None
    artifact_version: int | None = None
    artifact_message_id: str | None = None
