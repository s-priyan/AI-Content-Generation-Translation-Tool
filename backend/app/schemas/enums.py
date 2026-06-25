"""Enumerations shared across schemas."""

from __future__ import annotations

from enum import Enum


class ContentType(str, Enum):
    """Supported artifact content types."""

    ARTICLE = "article"
    CRM_EMAIL = "crm_email"
    PUSH = "push"
    SOCIAL = "social"


class Language(str, Enum):
    """Supported generation/translation languages."""

    EN = "en"
    FR = "fr"
    DE = "de"
    RO = "ro"
    EL = "el"


class MessageRole(str, Enum):
    """Role of a chat message."""

    USER = "user"
    ASSISTANT = "assistant"


class StreamEventType(str, Enum):
    """Discriminator for SSE events on the wire."""

    CHAT_DELTA = "chat_delta"
    ARTIFACT_DELTA = "artifact_delta"
    ARTIFACT_COMPLETE = "artifact_complete"
    VERSION_CREATED = "version_created"
    DONE = "done"
    ERROR = "error"


class ArtifactVersionSource(str, Enum):
    """How an artifact version came to exist."""

    GENERATION = "generation"
    TRANSLATION = "translation"
    EDIT = "edit"


class AgentIntent(str, Enum):
    """Result of the LangGraph intent-classification node."""

    GENERATE = "generate"
    REFINE = "refine"
    TRANSLATE = "translate"
