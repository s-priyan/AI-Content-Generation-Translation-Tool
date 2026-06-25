"""`GET /api/v1/config` — server-driven UI options."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.constants import CONTENT_TYPE_LABELS, LANGUAGE_LABELS
from app.schemas.config import AppConfigResponse, ConfigOption
from app.schemas.enums import ContentType, Language

router = APIRouter(tags=["config"])


@router.get("/config", response_model=AppConfigResponse)
async def get_config() -> AppConfigResponse:
    """Expose supported languages and content types so the UI is not hardcoded."""
    languages = [
        ConfigOption(code=lang.value, label=LANGUAGE_LABELS.get(lang, lang.value))
        for lang in Language
    ]
    content_types = [
        ConfigOption(code=ct.value, label=CONTENT_TYPE_LABELS.get(ct, ct.value))
        for ct in ContentType
    ]
    return AppConfigResponse(languages=languages, content_types=content_types)
