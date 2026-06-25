"""`POST /api/v1/generate` — streaming SSE response."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.exceptions import AppException
from app.core.logging import get_logger
from app.dependencies import get_generation_service
from app.schemas.enums import StreamEventType
from app.schemas.generate import GenerateRequest, StreamEvent
from app.services.generation import GenerationService

logger = get_logger(__name__)

router = APIRouter(tags=["generation"])


def _format_event(event: StreamEvent) -> str:
    return f"event: message\ndata: {event.model_dump_json()}\n\n"


@router.post("/generate")
async def generate(
    payload: GenerateRequest,
    service: GenerationService = Depends(get_generation_service),
) -> StreamingResponse:
    """Stream the agent's response as Server-Sent Events.

    Each SSE message is a JSON-serialized `StreamEvent`. The frontend's
    `useStream` hook parses these and routes to the chat / artifact panels.
    """

    async def event_stream():
        try:
            async for event in service.stream_generate(payload):
                yield _format_event(event)
        except AppException as exc:
            logger.warning("stream aborted by app error: %s", exc.code)
            yield _format_event(
                StreamEvent(
                    type=StreamEventType.ERROR,
                    data=exc.message,
                    error_code=exc.code,
                )
            )
            yield _format_event(StreamEvent(type=StreamEventType.DONE))
        except Exception as exc:  # noqa: BLE001
            logger.exception("unhandled error during stream")
            yield _format_event(
                StreamEvent(
                    type=StreamEventType.ERROR,
                    data=str(exc),
                    error_code="INTERNAL_ERROR",
                )
            )
            yield _format_event(StreamEvent(type=StreamEventType.DONE))

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
