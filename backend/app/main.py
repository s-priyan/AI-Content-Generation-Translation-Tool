"""FastAPI application entry point.

Responsibilities:
* Configure logging.
* Build app-scoped services (singleton `GenerationService`, `TranslationService`).
* Register CORS, routers, and exception handlers.
* Manage DB lifecycle via the lifespan context.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.config import get_settings
from app.core.exceptions import AppException
from app.core.logging import configure_logging, get_logger
from app.db.base import close_db, get_sessionmaker, init_db
from app.services.anthropic_client import AnthropicClient
from app.services.generation import GenerationService
from app.services.translation import TranslationService

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize app-scoped resources on startup; clean them up on shutdown."""
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info("starting AI Content Tool backend (model=%s)", settings.anthropic_model)

    await init_db()

    anthropic_client = AnthropicClient(
        api_key=settings.anthropic_api_key,
        default_model=settings.anthropic_model,
    )
    sessionmaker = get_sessionmaker()

    app.state.anthropic_client = anthropic_client
    app.state.generation_service = GenerationService(
        anthropic_client=anthropic_client,
        sessionmaker=sessionmaker,
        settings=settings,
    )
    app.state.translation_service = TranslationService(anthropic_client)

    try:
        yield
    finally:
        await close_db()
        logger.info("shutdown complete")


def create_app() -> FastAPI:
    """Application factory. Tests can call this with overrides applied."""
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="AI Content Generation & Translation Tool",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    app.include_router(api_router, prefix="/api/v1")

    _register_exception_handlers(app)

    return app


def _register_exception_handlers(app: FastAPI) -> None:
    """Map domain exceptions to the documented JSON envelope.

    Frontend reads `error.code`. Codes are stable; messages can change.
    """

    @app.exception_handler(AppException)
    async def _app_exception_handler(_: Request, exc: AppException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_exception_handler(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Request payload failed validation.",
                    "details": {"errors": exc.errors()},
                }
            },
        )

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled exception: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected server error occurred.",
                }
            },
        )


app = create_app()
