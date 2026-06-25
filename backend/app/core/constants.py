"""Static labels and lookup tables shared across the app.

Kept in `core` so both services (prompt building) and the `/config` endpoint
can use them without circular imports.
"""

from __future__ import annotations

from app.schemas.enums import ContentType, Language

LANGUAGE_LABELS: dict[Language, str] = {
    Language.EN: "English",
    Language.FR: "French",
    Language.DE: "German",
    Language.RO: "Romanian",
    Language.EL: "Greek",
}

CONTENT_TYPE_LABELS: dict[ContentType, str] = {
    ContentType.ARTICLE: "Article",
    ContentType.CRM_EMAIL: "CRM Email",
    ContentType.PUSH: "Push Notification",
    ContentType.SOCIAL: "Social Post",
}

CONTENT_TYPE_GUIDELINES: dict[ContentType, str] = {
    ContentType.ARTICLE: (
        "Long-form article. Use a clear headline, an engaging intro, structured sections "
        "with subheadings, and a conclusion. Aim for 400-1200 words depending on the topic."
    ),
    ContentType.CRM_EMAIL: (
        "Email with both a subject line and a body. Open with the subject on the first "
        "line as `Subject: ...`, then a blank line, then the email body. Keep it concise, "
        "personable, and action-oriented."
    ),
    ContentType.PUSH: (
        "Push notification. Strict cap of 140 characters. Single sentence, hook first, "
        "no closing salutation."
    ),
    ContentType.SOCIAL: (
        "Social media post. 1-3 short paragraphs, conversational tone, optional emoji, "
        "1-3 relevant hashtags at the end. Stay under 280 characters where possible."
    ),
}

ARTIFACT_OPEN_TAG: str = "<artifact>"
ARTIFACT_CLOSE_TAG: str = "</artifact>"
