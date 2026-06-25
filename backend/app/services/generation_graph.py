"""LangGraph `StateGraph` for the content-generation agent.

Topology:

    [entry]
       │
       ▼
    classify_intent  ──► route_by_intent ──┬─► generate ──┐
                                           ├─► refine   ──┼─► validate ─► [end]
                                           └─► translate ─┘

The graph itself is sync to construct; nodes are `async def`. Streaming nodes
push `StreamEvent` objects into an `asyncio.Queue` carried inside the state so
the orchestrator can yield them to the SSE response in real time.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.core.exceptions import AgentValidationError, AnthropicAPIError
from app.core.logging import get_logger
from app.schemas.agent_output import GeneratedContent
from app.schemas.enums import (
    AgentIntent,
    ContentType,
    Language,
    MessageRole,
    StreamEventType,
)
from app.schemas.generate import MessageInput, StreamEvent
from app.services.anthropic_client import AnthropicClient
from app.services.prompt_builder import (
    build_generate_prompt,
    build_intent_classification_prompt,
    build_refine_prompt,
    build_translate_prompt,
)
from app.services.stream_parser import ArtifactStreamRouter, split_artifact_and_chat

logger = get_logger(__name__)

_INTENT_TOOL: dict[str, Any] = {
    "name": "classify_intent",
    "description": "Classify the user's request as generate, refine, or translate.",
    "input_schema": {
        "type": "object",
        "properties": {
            "intent": {
                "type": "string",
                "enum": [item.value for item in AgentIntent],
                "description": "The classified intent.",
            }
        },
        "required": ["intent"],
    },
}


class AgentState(TypedDict, total=False):
    """State carried through the graph.

    Most fields are inputs; intent / draft_artifact / chat_message / final_output
    / error are populated as the graph progresses. `stream_queue` is the
    side-channel for token-level streaming and is never serialized.
    """

    messages: list[MessageInput]
    content_type: ContentType
    language: Language
    current_artifact: str | None
    uploaded_file_text: str | None

    intent: AgentIntent | None
    draft_artifact: str | None
    chat_message: str | None
    final_output: GeneratedContent | None
    error: str | None

    stream_queue: asyncio.Queue[StreamEvent | None] | None
    retry_attempted: bool


def _to_anthropic_messages(messages: list[MessageInput]) -> list[dict[str, str]]:
    return [{"role": m.role.value, "content": m.content} for m in messages]


def _augment_with_context(
    messages: list[MessageInput],
    current_artifact: str | None,
    uploaded_file_text: str | None,
) -> list[MessageInput]:
    """Inject context blocks at the front of the conversation.

    LangGraph's TypedDict immutability rules don't apply here — we copy.
    """
    context_lines: list[str] = []
    if uploaded_file_text:
        context_lines.append(
            "Reference material from the uploaded file:\n"
            "----------\n"
            f"{uploaded_file_text.strip()}\n"
            "----------"
        )
    if current_artifact:
        context_lines.append(
            "Current artifact draft:\n"
            "----------\n"
            f"{current_artifact.strip()}\n"
            "----------"
        )

    if not context_lines:
        return list(messages)

    context_message = MessageInput(
        role=MessageRole.USER,
        content="\n\n".join(context_lines),
    )
    return [context_message, *messages]


async def _emit(state: AgentState, event: StreamEvent) -> None:
    """Push an event into the stream queue if the orchestrator is listening."""
    queue = state.get("stream_queue")
    if queue is not None:
        await queue.put(event)


async def _classify_intent_node(state: AgentState, client: AnthropicClient) -> AgentState:
    """Call Claude to classify what the user is asking for.

    Falls back to a heuristic if the tool-use parse fails.
    """
    messages = _to_anthropic_messages(state["messages"])
    has_artifact = bool(state.get("current_artifact"))

    if not has_artifact:
        # Skip the LLM call when there's nothing to refine or translate.
        return {"intent": AgentIntent.GENERATE}

    try:
        result = await client.complete(
            messages=messages,
            system=build_intent_classification_prompt(),
            tools=[_INTENT_TOOL],
            max_tokens=128,
            temperature=0.0,
        )
    except AnthropicAPIError as exc:
        logger.warning("intent classification failed, falling back: %s", exc)
        return {"intent": AgentIntent.REFINE}

    tool_use = result.get("tool_use")
    if tool_use and isinstance(tool_use.get("input"), dict):
        intent_value = tool_use["input"].get("intent", "refine")
    else:
        intent_value = _heuristic_intent(state["messages"], has_artifact)

    try:
        intent = AgentIntent(intent_value)
    except ValueError:
        intent = AgentIntent.REFINE

    return {"intent": intent}


def _heuristic_intent(messages: list[MessageInput], has_artifact: bool) -> str:
    """Cheap fallback: keyword sniff on the latest user message."""
    last_user = next(
        (m for m in reversed(messages) if m.role == MessageRole.USER),
        None,
    )
    if last_user is None:
        return AgentIntent.GENERATE.value

    lowered = last_user.content.lower()
    translate_markers = ("translate", "in french", "in german", "in greek", "in romanian")
    if has_artifact and any(marker in lowered for marker in translate_markers):
        return AgentIntent.TRANSLATE.value
    if has_artifact:
        return AgentIntent.REFINE.value
    return AgentIntent.GENERATE.value


async def _stream_via_router(
    client: AnthropicClient,
    *,
    system: str,
    messages: list[dict[str, str]],
    state: AgentState,
) -> tuple[str, str]:
    """Stream Claude tokens, route them via `ArtifactStreamRouter`, and emit events.

    Returns (artifact_text, chat_text).

    @throws AnthropicAPIError on upstream failures.
    """
    router = ArtifactStreamRouter()
    chat_chunks: list[str] = []

    async for chunk in client.stream_messages(messages=messages, system=system):
        events = router.feed(chunk)
        for event in events:
            if event.type is StreamEventType.CHAT_DELTA and event.data:
                chat_chunks.append(event.data)
            await _emit(state, event)

    for event in router.flush():
        if event.type is StreamEventType.CHAT_DELTA and event.data:
            chat_chunks.append(event.data)
        await _emit(state, event)

    return router.artifact_text.strip(), "".join(chat_chunks).strip()


async def _generate_node(state: AgentState, client: AnthropicClient) -> AgentState:
    """First-draft generation."""
    augmented = _augment_with_context(
        state["messages"],
        state.get("current_artifact"),
        state.get("uploaded_file_text"),
    )
    artifact, chat = await _stream_via_router(
        client,
        system=build_generate_prompt(state["content_type"], state["language"]),
        messages=_to_anthropic_messages(augmented),
        state=state,
    )
    return {"draft_artifact": artifact, "chat_message": chat}


async def _refine_node(state: AgentState, client: AnthropicClient) -> AgentState:
    """Apply user feedback to the existing artifact."""
    augmented = _augment_with_context(
        state["messages"],
        state.get("current_artifact"),
        state.get("uploaded_file_text"),
    )
    artifact, chat = await _stream_via_router(
        client,
        system=build_refine_prompt(state["content_type"], state["language"]),
        messages=_to_anthropic_messages(augmented),
        state=state,
    )
    return {"draft_artifact": artifact, "chat_message": chat}


async def _translate_node(state: AgentState, client: AnthropicClient) -> AgentState:
    """Translate the existing artifact into the target language."""
    augmented = _augment_with_context(
        state["messages"],
        state.get("current_artifact"),
        uploaded_file_text=None,
    )
    artifact, chat = await _stream_via_router(
        client,
        system=build_translate_prompt(state["language"]),
        messages=_to_anthropic_messages(augmented),
        state=state,
    )
    return {"draft_artifact": artifact, "chat_message": chat}


async def _validate_output_node(state: AgentState, client: AnthropicClient) -> AgentState:
    """Validate the streamed result and assemble the final structured output.

    If parsing failed (e.g. Claude forgot the tags), retry once by asking
    Claude to repair the response.

    @throws AgentValidationError if validation cannot be salvaged.
    """
    artifact = (state.get("draft_artifact") or "").strip()
    chat = (state.get("chat_message") or "").strip()

    if not artifact and not state.get("retry_attempted"):
        repair_prompt = (
            "Your previous response was missing the required <artifact>...</artifact> "
            "tags. Please reproduce the same content, this time with the artifact "
            "wrapped in <artifact></artifact> followed by a short chat note."
        )
        retry_messages = _to_anthropic_messages(state["messages"]) + [
            {"role": "user", "content": repair_prompt}
        ]
        try:
            result = await client.complete(
                system=build_generate_prompt(state["content_type"], state["language"]),
                messages=retry_messages,
                max_tokens=4096,
                temperature=0.2,
            )
            artifact, chat = split_artifact_and_chat(result["text"])
        except AnthropicAPIError as exc:
            raise AgentValidationError("Agent retry failed.") from exc

        # Replay the recovered output as a single block to the stream consumer.
        if artifact:
            await _emit(state, StreamEvent(type=StreamEventType.ARTIFACT_DELTA, data=artifact))
            await _emit(state, StreamEvent(type=StreamEventType.ARTIFACT_COMPLETE))
        if chat:
            await _emit(state, StreamEvent(type=StreamEventType.CHAT_DELTA, data=chat))

    if not artifact:
        raise AgentValidationError("Agent did not produce an artifact.")

    final = GeneratedContent(
        artifact=artifact,
        chat_message=chat or "Done.",
        language=state["language"],
        content_type=state["content_type"],
        word_count=len(artifact.split()),
        metadata={
            "intent": (state.get("intent") or AgentIntent.GENERATE).value,
            "retry_attempted": bool(state.get("retry_attempted")),
        },
    )
    return {"final_output": final, "draft_artifact": artifact, "chat_message": chat}


def _route_after_classification(state: AgentState) -> str:
    """Choose the next node based on the classified intent."""
    intent = state.get("intent") or AgentIntent.GENERATE
    return {
        AgentIntent.GENERATE: "generate",
        AgentIntent.REFINE: "refine",
        AgentIntent.TRANSLATE: "translate",
    }[intent]


def build_generation_graph(client: AnthropicClient) -> Any:
    """Compile the LangGraph `StateGraph`. Re-used across requests (stateless).

    Each node is wrapped in an `async def` (rather than a `lambda`) so
    LangGraph awaits the coroutine instead of treating it as a sync return
    value — see https://docs.langchain.com/oss/python/langgraph/errors/INVALID_GRAPH_NODE_RETURN_VALUE.
    """
    graph = StateGraph(AgentState)

    async def classify_intent(state: AgentState) -> AgentState:
        return await _classify_intent_node(state, client)

    async def generate(state: AgentState) -> AgentState:
        return await _generate_node(state, client)

    async def refine(state: AgentState) -> AgentState:
        return await _refine_node(state, client)

    async def translate(state: AgentState) -> AgentState:
        return await _translate_node(state, client)

    async def validate(state: AgentState) -> AgentState:
        return await _validate_output_node(state, client)

    graph.add_node("classify_intent", classify_intent)
    graph.add_node("generate", generate)
    graph.add_node("refine", refine)
    graph.add_node("translate", translate)
    graph.add_node("validate", validate)

    graph.set_entry_point("classify_intent")
    graph.add_conditional_edges(
        "classify_intent",
        _route_after_classification,
        {
            "generate": "generate",
            "refine": "refine",
            "translate": "translate",
        },
    )
    graph.add_edge("generate", "validate")
    graph.add_edge("refine", "validate")
    graph.add_edge("translate", "validate")
    graph.add_edge("validate", END)

    return graph.compile()


def build_initial_state(
    *,
    messages: list[MessageInput],
    content_type: ContentType,
    language: Language,
    current_artifact: str | None,
    uploaded_file_text: str | None,
    stream_queue: asyncio.Queue[StreamEvent | None] | None = None,
) -> AgentState:
    """Build the initial `AgentState` for one graph run."""
    state: AgentState = {
        "messages": messages,
        "content_type": content_type,
        "language": language,
        "current_artifact": current_artifact,
        "uploaded_file_text": uploaded_file_text,
        "intent": None,
        "draft_artifact": None,
        "chat_message": None,
        "final_output": None,
        "error": None,
        "stream_queue": stream_queue,
        "retry_attempted": False,
    }
    return state


def serialize_intent_tool() -> str:
    """Helper for tests / debug — exposes the tool definition as JSON."""
    return json.dumps(_INTENT_TOOL, indent=2)
