"""Schemas for the `/config` endpoint that powers UI dropdowns."""

from __future__ import annotations

from pydantic import BaseModel


class ConfigOption(BaseModel):
    code: str
    label: str


class AppConfigResponse(BaseModel):
    languages: list[ConfigOption]
    content_types: list[ConfigOption]
