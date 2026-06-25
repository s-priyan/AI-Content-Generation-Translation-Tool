"""Schemas for the agent's structured final output."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.enums import ContentType, Language


class GeneratedContent(BaseModel):
    """Final structured output from the generation agent.

    Built once the streamed response has fully arrived and the artifact body
    has been extracted from the `<artifact>` tags.
    """

    artifact: str = Field(..., description="The full content draft.")
    chat_message: str = Field(
        ...,
        description="Short conversational note shown in the chat panel.",
    )
    language: Language
    content_type: ContentType
    word_count: int = Field(..., ge=0)
    metadata: dict = Field(default_factory=dict)
