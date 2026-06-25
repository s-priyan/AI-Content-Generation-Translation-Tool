"""Unit tests for the artifact/chat stream parser."""

from __future__ import annotations

import pytest

from app.schemas.enums import StreamEventType
from app.services.stream_parser import (
    ArtifactStreamRouter,
    split_artifact_and_chat,
)


def _drain(router: ArtifactStreamRouter, chunks: list[str]) -> list[tuple[str, str | None]]:
    out: list[tuple[str, str | None]] = []
    for chunk in chunks:
        for event in router.feed(chunk):
            out.append((event.type.value, event.data))
    for event in router.flush():
        out.append((event.type.value, event.data))
    return out


def test_simple_full_response() -> None:
    router = ArtifactStreamRouter()
    events = _drain(
        router,
        ["<artifact>Hello world</artifact>Here is your draft."],
    )
    assert events == [
        (StreamEventType.ARTIFACT_DELTA.value, "Hello world"),
        (StreamEventType.ARTIFACT_COMPLETE.value, None),
        (StreamEventType.CHAT_DELTA.value, "Here is your draft."),
    ]
    assert router.artifact_text == "Hello world"


def test_tag_split_across_chunks() -> None:
    router = ArtifactStreamRouter()
    chunks = ["<arti", "fact>Body", " text</arti", "fact>Done."]
    events = _drain(router, chunks)
    artifact_chunks = [data for typ, data in events if typ == StreamEventType.ARTIFACT_DELTA.value]
    chat_chunks = [data for typ, data in events if typ == StreamEventType.CHAT_DELTA.value]
    assert "".join(c for c in artifact_chunks if c) == "Body text"
    assert "".join(c for c in chat_chunks if c) == "Done."
    assert router.artifact_text == "Body text"


def test_chat_before_artifact() -> None:
    router = ArtifactStreamRouter()
    events = _drain(
        router,
        ["Sure, here you go: ", "<artifact>X</artifact>"],
    )
    assert events[0] == (StreamEventType.CHAT_DELTA.value, "Sure, here you go: ")
    assert (StreamEventType.ARTIFACT_DELTA.value, "X") in events
    assert (StreamEventType.ARTIFACT_COMPLETE.value, None) in events


def test_no_tags_treated_as_chat() -> None:
    router = ArtifactStreamRouter()
    events = _drain(router, ["just chatting, no draft"])
    assert events == [(StreamEventType.CHAT_DELTA.value, "just chatting, no draft")]
    assert router.artifact_text == ""


def test_split_helper() -> None:
    artifact, chat = split_artifact_and_chat(
        "<artifact>Body</artifact>Done."
    )
    assert artifact == "Body"
    assert chat == "Done."


def test_split_helper_no_tags() -> None:
    artifact, chat = split_artifact_and_chat("Hello there")
    assert artifact == ""
    assert chat == "Hello there"


@pytest.mark.parametrize(
    "chunks",
    [
        ["<artifact>One</artifact>"],
        ["<", "artifact>", "Two", "</", "artifact>"],
        ["pre <artifact>Three</artifact> post"],
    ],
)
def test_artifact_text_collected(chunks: list[str]) -> None:
    router = ArtifactStreamRouter()
    _drain(router, chunks)
    assert router.artifact_text in {"One", "Two", "Three"}
