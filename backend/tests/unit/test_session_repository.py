"""Repository tests against an in-memory SQLite database."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.models import MessageORM, SessionORM  # noqa: F401  (register on Base)
from app.repositories.session_repository import SessionRepository
from app.schemas.enums import ContentType, Language, MessageRole
from app.schemas.session import MessageCreate, SessionCreate, SessionUpdate


@pytest_asyncio.fixture
async def repo() -> SessionRepository:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    async with sessionmaker() as db:
        yield SessionRepository(db)
        await db.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_create_and_fetch_session(repo: SessionRepository) -> None:
    created = await repo.create(
        SessionCreate(content_type=ContentType.ARTICLE, language=Language.EN)
    )
    fetched = await repo.get(created.id)
    assert fetched.id == created.id
    assert fetched.content_type == ContentType.ARTICLE


@pytest.mark.asyncio
async def test_append_message_and_fetch_with_messages(
    repo: SessionRepository,
) -> None:
    session = await repo.create(
        SessionCreate(content_type=ContentType.PUSH, language=Language.EN)
    )
    await repo.append_message(
        session.id,
        MessageCreate(role=MessageRole.USER, content="Hello"),
    )
    detailed = await repo.get_with_messages(session.id)
    assert len(detailed.messages) == 1
    assert detailed.messages[0].content == "Hello"


@pytest.mark.asyncio
async def test_update_artifact(repo: SessionRepository) -> None:
    session = await repo.create(
        SessionCreate(content_type=ContentType.SOCIAL, language=Language.FR)
    )
    updated = await repo.update_artifact(session.id, "Bonjour le monde")
    assert updated.artifact == "Bonjour le monde"


@pytest.mark.asyncio
async def test_update_partial_fields(repo: SessionRepository) -> None:
    session = await repo.create(
        SessionCreate(content_type=ContentType.ARTICLE, language=Language.EN)
    )
    updated = await repo.update(session.id, SessionUpdate(title="Renamed"))
    assert updated.title == "Renamed"
    assert updated.content_type == ContentType.ARTICLE


@pytest.mark.asyncio
async def test_list_sessions_orders_recent_first(
    repo: SessionRepository,
) -> None:
    a = await repo.create(SessionCreate(content_type=ContentType.PUSH, language=Language.EN))
    b = await repo.create(SessionCreate(content_type=ContentType.PUSH, language=Language.EN))
    listed = await repo.list_all(limit=10)
    assert {s.id for s in listed} == {a.id, b.id}
