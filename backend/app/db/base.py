"""Async SQLAlchemy engine, session factory, and Declarative base.

A single engine is created from `Settings.database_url`. `get_session` is a
dependency-friendly async generator that hands out a fresh `AsyncSession` per
request and guarantees rollback on uncaught exceptions.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    """Project-wide declarative base for SQLAlchemy ORM models."""


_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """Lazily create the global engine on first access."""
    global _engine, _sessionmaker
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            echo=False,
            future=True,
            pool_pre_ping=True,
        )
        _sessionmaker = async_sessionmaker(
            _engine,
            expire_on_commit=False,
            class_=AsyncSession,
        )
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    if _sessionmaker is None:
        get_engine()
    assert _sessionmaker is not None
    return _sessionmaker


async def init_db() -> None:
    """Create tables if missing and run small idempotent migrations.

    Real Alembic migrations are out of scope; we only need to keep dev DBs
    moving forward when the schema gains columns or tables. Each step is a
    no-op once already applied.
    """
    from app.db import models  # noqa: F401  (register models on Base.metadata)

    engine = get_engine()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.run_sync(_apply_migrations)


def _apply_migrations(sync_conn) -> None:
    """Tiny in-place migrations for dev SQLite databases.

    Adds new columns to existing tables and backfills artifact_versions for
    legacy sessions that pre-date the versioning model.
    """
    inspector = inspect(sync_conn)

    # 1) messages.artifact_version_id (added when versioning landed).
    msg_cols = {col["name"] for col in inspector.get_columns("messages")}
    if "artifact_version_id" not in msg_cols:
        sync_conn.execute(
            text("ALTER TABLE messages ADD COLUMN artifact_version_id VARCHAR(36)")
        )

    # 2) Backfill: any session with `artifact IS NOT NULL` but no rows in
    #    artifact_versions gets a synthesized v1 from the stored snapshot.
    legacy = sync_conn.execute(
        text(
            """
            SELECT s.id AS session_id, s.artifact, s.language
            FROM sessions s
            LEFT JOIN artifact_versions v ON v.session_id = s.id
            WHERE s.artifact IS NOT NULL
            GROUP BY s.id
            HAVING COUNT(v.id) = 0
            """
        )
    ).all()
    if not legacy:
        return

    now = datetime.now(timezone.utc).isoformat()
    for row in legacy:
        version_id = str(uuid.uuid4())
        sync_conn.execute(
            text(
                """
                INSERT INTO artifact_versions
                    (id, session_id, version, content, language, source, created_at)
                VALUES (:id, :sid, 1, :content, :lang, 'generation', :ts)
                """
            ),
            {
                "id": version_id,
                "sid": row.session_id,
                "content": row.artifact,
                "lang": row.language,
                "ts": now,
            },
        )
        # Best-effort: link the most recent assistant message in this session
        # to the synthesized v1 so the "Draft ready" CTA has somewhere to land.
        sync_conn.execute(
            text(
                """
                UPDATE messages
                SET artifact_version_id = :vid
                WHERE id = (
                    SELECT id FROM messages
                    WHERE session_id = :sid AND role = 'assistant'
                    ORDER BY created_at DESC
                    LIMIT 1
                )
                """
            ),
            {"vid": version_id, "sid": row.session_id},
        )


async def close_db() -> None:
    """Dispose the engine on shutdown."""
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a request-scoped session."""
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
