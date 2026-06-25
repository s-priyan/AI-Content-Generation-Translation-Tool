"""Stream parser that routes Claude's streamed tokens.

Claude is instructed (by `prompt_builder`) to wrap the artifact in
`<artifact>...</artifact>` tags. Tokens arrive as arbitrary chunks that may
split a tag across boundaries, so the parser is implemented as a small state
machine with a tag-shaped lookahead buffer.

Public surface:

* `ArtifactStreamRouter.feed(chunk)` — feed an incoming text chunk; returns a
  list of `StreamEvent`s to emit.
* `ArtifactStreamRouter.flush()` — call once the upstream stream is done;
  emits any trailing chat tokens, the `ARTIFACT_COMPLETE` event if needed, and
  the final accumulated artifact text via `artifact_text`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from app.core.constants import ARTIFACT_CLOSE_TAG, ARTIFACT_OPEN_TAG
from app.schemas.enums import StreamEventType
from app.schemas.generate import StreamEvent

_OPEN_TAG = ARTIFACT_OPEN_TAG
_CLOSE_TAG = ARTIFACT_CLOSE_TAG
_MAX_LOOKAHEAD = max(len(_OPEN_TAG), len(_CLOSE_TAG))


class _Mode(str, Enum):
    OUTSIDE = "outside"
    INSIDE = "inside"
    AFTER = "after"


def _safe_emit_size(buffer: str, target_tag: str) -> int:
    """How many characters from `buffer` are safe to emit without losing a tag.

    Keeps a tail equal to `len(target_tag) - 1` characters because the next
    chunk may complete a tag that just started. If the buffer ends with a
    longer-than-tail prefix that doesn't match the tag's first chars, we can
    still emit those.
    """
    tail_size = len(target_tag) - 1
    if len(buffer) <= tail_size:
        return 0

    # The most we'd ever want to keep buffered is the longest prefix of
    # `target_tag` that is also a suffix of `buffer`.
    max_keep = min(tail_size, len(buffer))
    for keep in range(max_keep, 0, -1):
        if buffer[-keep:] == target_tag[:keep]:
            return len(buffer) - keep
    return len(buffer)


@dataclass
class ArtifactStreamRouter:
    """Stateful parser routing tokens to chat / artifact channels."""

    _mode: _Mode = _Mode.OUTSIDE
    _buffer: str = ""
    _artifact_chunks: list[str] = field(default_factory=list)
    _emitted_complete: bool = False

    @property
    def artifact_text(self) -> str:
        """Full artifact body collected so far."""
        return "".join(self._artifact_chunks)

    def feed(self, chunk: str) -> list[StreamEvent]:
        """Process an incoming token chunk and return any emitted events."""
        if not chunk:
            return []

        events: list[StreamEvent] = []
        self._buffer += chunk

        progress = True
        while progress:
            progress = False
            if self._mode is _Mode.OUTSIDE:
                progress = self._consume_outside(events)
            elif self._mode is _Mode.INSIDE:
                progress = self._consume_inside(events)
            else:
                progress = self._consume_after(events)

        return events

    def flush(self) -> list[StreamEvent]:
        """Flush any remaining buffered text once the stream ends."""
        events: list[StreamEvent] = []
        if self._buffer:
            if self._mode is _Mode.INSIDE:
                self._artifact_chunks.append(self._buffer)
            else:
                events.append(
                    StreamEvent(type=StreamEventType.CHAT_DELTA, data=self._buffer)
                )
            self._buffer = ""

        if self._mode is _Mode.INSIDE and not self._emitted_complete:
            events.append(StreamEvent(type=StreamEventType.ARTIFACT_COMPLETE))
            self._emitted_complete = True
            self._mode = _Mode.AFTER

        if self._artifact_chunks and not self._emitted_complete:
            events.append(StreamEvent(type=StreamEventType.ARTIFACT_COMPLETE))
            self._emitted_complete = True

        return events

    def _consume_outside(self, events: list[StreamEvent]) -> bool:
        """Outside the artifact tags: emit chat tokens until we hit `<artifact>`."""
        idx = self._buffer.find(_OPEN_TAG)
        if idx >= 0:
            if idx > 0:
                events.append(
                    StreamEvent(type=StreamEventType.CHAT_DELTA, data=self._buffer[:idx])
                )
            self._buffer = self._buffer[idx + len(_OPEN_TAG):]
            self._mode = _Mode.INSIDE
            return True

        emit_size = _safe_emit_size(self._buffer, _OPEN_TAG)
        if emit_size > 0:
            events.append(
                StreamEvent(type=StreamEventType.CHAT_DELTA, data=self._buffer[:emit_size])
            )
            self._buffer = self._buffer[emit_size:]
        return False

    def _consume_inside(self, events: list[StreamEvent]) -> bool:
        """Inside the artifact tags: collect tokens until we hit `</artifact>`."""
        idx = self._buffer.find(_CLOSE_TAG)
        if idx >= 0:
            if idx > 0:
                self._artifact_chunks.append(self._buffer[:idx])
                events.append(
                    StreamEvent(
                        type=StreamEventType.ARTIFACT_DELTA,
                        data=self._buffer[:idx],
                    )
                )
            self._buffer = self._buffer[idx + len(_CLOSE_TAG):]
            events.append(StreamEvent(type=StreamEventType.ARTIFACT_COMPLETE))
            self._emitted_complete = True
            self._mode = _Mode.AFTER
            return True

        emit_size = _safe_emit_size(self._buffer, _CLOSE_TAG)
        if emit_size > 0:
            chunk_to_emit = self._buffer[:emit_size]
            self._artifact_chunks.append(chunk_to_emit)
            events.append(
                StreamEvent(type=StreamEventType.ARTIFACT_DELTA, data=chunk_to_emit)
            )
            self._buffer = self._buffer[emit_size:]
        return False

    def _consume_after(self, events: list[StreamEvent]) -> bool:
        """After the artifact closes: everything is chat."""
        if not self._buffer:
            return False
        events.append(StreamEvent(type=StreamEventType.CHAT_DELTA, data=self._buffer))
        self._buffer = ""
        return False


def split_artifact_and_chat(raw: str) -> tuple[str, str]:
    """Utility for non-streaming responses: extract `(artifact, chat)` from text.

    Returns the empty artifact and the raw text as chat if no tags are present.
    """
    open_idx = raw.find(_OPEN_TAG)
    close_idx = raw.find(_CLOSE_TAG)
    if open_idx < 0 or close_idx < 0 or close_idx < open_idx:
        return "", raw.strip()

    artifact = raw[open_idx + len(_OPEN_TAG): close_idx].strip()
    chat_before = raw[:open_idx].strip()
    chat_after = raw[close_idx + len(_CLOSE_TAG):].strip()
    chat = "\n".join(part for part in (chat_before, chat_after) if part)
    return artifact, chat
