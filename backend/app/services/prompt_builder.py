"""Pure prompt-building functions.

No I/O, no state — every function is a deterministic mapping from inputs to a
string. Kept easy to unit-test and easy to tweak without touching service code.
"""

from __future__ import annotations

from app.core.constants import (
    ARTIFACT_CLOSE_TAG,
    ARTIFACT_OPEN_TAG,
    CONTENT_TYPE_GUIDELINES,
    LANGUAGE_LABELS,
)
from app.schemas.enums import ContentType, Language

_BASE_OUTPUT_RULES: str = f"""
Your reply MUST follow this exact structure:

1. First, the entire content draft wrapped in `{ARTIFACT_OPEN_TAG}` and \
`{ARTIFACT_CLOSE_TAG}` tags. Do NOT include the tag names anywhere else.
2. After the closing tag, write a short conversational note (1-3 sentences) for \
the user explaining what you produced or what you changed.

Never put XML, JSON, or any wrapping format inside the artifact tags — just the \
raw content as the user should see it.
"""


def _language_clause(language: Language) -> str:
    label = LANGUAGE_LABELS.get(language, language.value)
    return f"Write the artifact entirely in {label} ({language.value})."


def build_generate_prompt(content_type: ContentType, language: Language) -> str:
    """System prompt for first-draft generation."""
    guidelines = CONTENT_TYPE_GUIDELINES[content_type]
    return f"""\
You are an expert {content_type.value.replace("_", " ")} writer for a marketing \
content team.

{_language_clause(language)}

Content guidelines:
{guidelines}

{_BASE_OUTPUT_RULES}
""".strip()


def build_refine_prompt(content_type: ContentType, language: Language) -> str:
    """System prompt for refining the existing artifact."""
    guidelines = CONTENT_TYPE_GUIDELINES[content_type]
    return f"""\
You are revising an existing {content_type.value.replace("_", " ")} draft based \
on the user's latest feedback.

{_language_clause(language)}

Rules:
- Treat the user's most recent message as the change request.
- Keep parts that the user does not ask to change.
- Preserve the structure expected for this content type:
{guidelines}
- Do not introduce new topics that were not requested.

{_BASE_OUTPUT_RULES}
""".strip()


def build_translate_prompt(target_language: Language) -> str:
    """System prompt for in-chat translation embedded in the agent."""
    label = LANGUAGE_LABELS.get(target_language, target_language.value)
    return f"""\
You are a precise translator. Translate the provided draft into {label} \
({target_language.value}) while preserving:

- Markdown / formatting (headings, lists, bold, links).
- Line breaks and paragraph structure.
- Numbers, proper nouns, and product names.

Do not add commentary inside the translation. Do not summarize.

{_BASE_OUTPUT_RULES}
""".strip()


def build_intent_classification_prompt() -> str:
    """System prompt for the LangGraph intent-classification node."""
    return """\
You are a router for a content-generation assistant. Decide what the user is \
asking for in their most recent message.

Return one of these exact values via the `classify_intent` tool:
- "generate" — the user wants a brand-new draft, or there is no current artifact yet.
- "refine"   — the user wants to edit, improve, shorten, expand, or rewrite the \
existing artifact.
- "translate" — the user wants the existing artifact translated into another \
language.

If the user has not provided a current artifact and asks for new content, choose \
"generate". If they ask to "translate this" / "in French" / "auf Deutsch" while \
an artifact exists, choose "translate". Otherwise, "refine".
""".strip()


def build_standalone_translate_prompt(
    target_language: Language,
    preserve_formatting: bool,
) -> str:
    """System prompt for the standalone `/translate` endpoint (no SSE)."""
    label = LANGUAGE_LABELS.get(target_language, target_language.value)
    formatting_clause = (
        "Preserve all original formatting, line breaks, lists, and markdown."
        if preserve_formatting
        else "You may collapse formatting if it improves readability."
    )
    return f"""\
You are a precise translator. Translate the user-provided text into {label} \
({target_language.value}).

Rules:
- {formatting_clause}
- Keep proper nouns, brand names, and numbers intact.
- Output ONLY the translated text. No preface, no commentary, no quotes.
""".strip()
