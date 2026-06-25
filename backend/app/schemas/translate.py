"""Schemas for the standalone translation endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.enums import Language


class TranslateRequest(BaseModel):
    """`POST /api/v1/translate` payload."""

    text: str = Field(..., min_length=1)
    target_language: Language
    source_language: Language | None = None
    preserve_formatting: bool = True


class TranslateResponse(BaseModel):
    """`POST /api/v1/translate` response."""

    translated_text: str
    source_language: Language
    target_language: Language
