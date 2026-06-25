"""CRUD over chat sessions and their messages."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status

from app.dependencies import get_session_repository
from app.repositories.session_repository import SessionRepository
from app.schemas.session import (
    Message,
    Session,
    SessionCreate,
    SessionUpdate,
    SessionWithMessages,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[Session])
async def list_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    repo: SessionRepository = Depends(get_session_repository),
) -> list[Session]:
    """List sessions ordered by most-recent-update first."""
    return await repo.list_all(limit=limit)


@router.post("", response_model=Session, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: SessionCreate,
    repo: SessionRepository = Depends(get_session_repository),
) -> Session:
    """Create a new chat session."""
    return await repo.create(payload)


@router.get("/{session_id}", response_model=SessionWithMessages)
async def get_session_with_messages(
    session_id: str,
    repo: SessionRepository = Depends(get_session_repository),
) -> SessionWithMessages:
    """Fetch a single session including its full message history."""
    return await repo.get_with_messages(session_id)


@router.patch("/{session_id}", response_model=Session)
async def update_session(
    session_id: str,
    payload: SessionUpdate,
    repo: SessionRepository = Depends(get_session_repository),
) -> Session:
    """Patch any subset of session fields."""
    return await repo.update(session_id, payload)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    repo: SessionRepository = Depends(get_session_repository),
) -> None:
    """Hard-delete a session and its messages."""
    await repo.delete(session_id)


@router.get("/{session_id}/messages", response_model=list[Message])
async def list_messages(
    session_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    repo: SessionRepository = Depends(get_session_repository),
) -> list[Message]:
    """Paginated message listing for a single session."""
    return await repo.list_messages(session_id, limit=limit, offset=offset)
