"""Aggregates all v1 routers under a single import."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import config as config_router
from app.api.v1 import files as files_router
from app.api.v1 import generate as generate_router
from app.api.v1 import health as health_router
from app.api.v1 import sessions as sessions_router
from app.api.v1 import translate as translate_router

api_router = APIRouter()
api_router.include_router(health_router.router)
api_router.include_router(config_router.router)
api_router.include_router(generate_router.router)
api_router.include_router(translate_router.router)
api_router.include_router(files_router.router)
api_router.include_router(sessions_router.router)
