"""Schemas for file parsing endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ParsedFileResponse(BaseModel):
    """Result of `POST /api/v1/parse-file`."""

    filename: str
    text: str
    page_count: int | None = None
    word_count: int = Field(..., ge=0)
    mime_type: str
