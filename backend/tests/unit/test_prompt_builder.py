"""Unit tests for the prompt builder."""

from __future__ import annotations

from app.schemas.enums import ContentType, Language
from app.services.prompt_builder import (
    build_generate_prompt,
    build_intent_classification_prompt,
    build_refine_prompt,
    build_standalone_translate_prompt,
    build_translate_prompt,
)


def test_generate_prompt_mentions_language_and_content_type() -> None:
    prompt = build_generate_prompt(ContentType.CRM_EMAIL, Language.FR)
    assert "French" in prompt
    assert "fr" in prompt
    assert "<artifact>" in prompt
    assert "</artifact>" in prompt


def test_refine_prompt_keeps_structure_for_push() -> None:
    prompt = build_refine_prompt(ContentType.PUSH, Language.EN)
    assert "140" in prompt
    assert "<artifact>" in prompt


def test_translate_prompt_targets_language() -> None:
    prompt = build_translate_prompt(Language.DE)
    assert "German" in prompt


def test_standalone_translate_preserves_formatting_clause() -> None:
    prompt = build_standalone_translate_prompt(Language.RO, preserve_formatting=True)
    assert "Preserve" in prompt or "preserve" in prompt


def test_intent_prompt_lists_three_intents() -> None:
    prompt = build_intent_classification_prompt()
    for value in ("generate", "refine", "translate"):
        assert value in prompt
