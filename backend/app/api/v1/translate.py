"""`POST /api/v1/translate` — standalone translation (non-SSE)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_translation_service
from app.schemas.translate import TranslateRequest, TranslateResponse
from app.services.translation import TranslationService

router = APIRouter(tags=["translate"])


@router.post("/translate", response_model=TranslateResponse)
async def translate(
    payload: TranslateRequest,
    service: TranslationService = Depends(get_translation_service),
) -> TranslateResponse:
    """Translate `payload.text` to `payload.target_language`."""
    return await service.translate(payload)
