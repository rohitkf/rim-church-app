"""
Manual Claude tool-calling loop (Section 7 / FR16 of the PRD).

A manual loop rather than the SDK's (beta) tool runner, so we can pause
before executing a destructive tool and hand control back to the caller
for confirmation (FR16.4) — see DESTRUCTIVE_TOOLS in tools/schemas.py.
Every tool executes against the *calling user's own* Supabase client, so
RLS enforces exactly what that user could do manually (FR16.3) — this
loop has no separate permission logic of its own.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import anthropic
from supabase import Client

from .config import settings
from .tools.executors import execute_tool
from .tools.schemas import DESTRUCTIVE_TOOLS, TOOL_SCHEMAS

SYSTEM_PROMPT = (
    "You are the operations assistant for a church's service coordination app. "
    "You can answer questions about departments, teams, checklists, attendance, "
    "and inventory, and can perform actions on the user's behalf using the "
    "provided tools. Always look up ids (e.g. via get_checklist_status or "
    "get_inventory) before calling a tool that needs one. If a tool call fails "
    "because of a permission or RLS error, tell the user plainly that they "
    "don't have permission for that action rather than retrying. Keep replies "
    "concise — this is a chat panel, not a report."
)

_anthropic_client: anthropic.Anthropic | None = None


def _get_anthropic_client() -> anthropic.Anthropic:
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic(api_key=settings.llm_api_key)
    return _anthropic_client


@dataclass
class PendingAction:
    tool_use_id: str
    tool_name: str
    tool_input: dict


@dataclass
class AgentResult:
    reply: str
    history: list[dict] = field(default_factory=list)
    pending_actions: list[PendingAction] | None = None


def _extract_text(content: list[Any]) -> str:
    return "".join(block.text for block in content if getattr(block, "type", None) == "text")


def _serialize_content(content: list[Any]) -> list[dict]:
    return [block.model_dump() for block in content]


def start_turn(client: Client, user_id: str, history: list[dict], user_text: str) -> AgentResult:
    messages = [*history, {"role": "user", "content": user_text}]
    return _run_loop(client, user_id, messages)


def resume_after_confirmation(
    client: Client,
    user_id: str,
    history: list[dict],
    pending_actions: list[PendingAction],
    approved: bool,
) -> AgentResult:
    tool_results = []
    for action in pending_actions:
        if approved:
            result, is_error = execute_tool(client, user_id, action.tool_name, action.tool_input)
        else:
            result, is_error = {"cancelled": "The user declined this action."}, False
        tool_results.append(
            {
                "type": "tool_result",
                "tool_use_id": action.tool_use_id,
                "content": _to_content_str(result),
                "is_error": is_error,
            }
        )
    messages = [*history, {"role": "user", "content": tool_results}]
    return _run_loop(client, user_id, messages)


def _to_content_str(result: dict) -> str:
    import json

    return json.dumps(result)


def _run_loop(client: Client, user_id: str, messages: list[dict]) -> AgentResult:
    anthropic_client = _get_anthropic_client()

    # Bounded, not infinite: a well-behaved conversation resolves in a
    # handful of tool round-trips; this guards against a runaway loop
    # burning tokens if the model keeps calling tools without converging.
    for _ in range(8):
        response = anthropic_client.messages.create(
            model=settings.anthropic_model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=TOOL_SCHEMAS,
            messages=messages,
        )
        messages.append({"role": "assistant", "content": _serialize_content(response.content)})

        if response.stop_reason != "tool_use":
            return AgentResult(reply=_extract_text(response.content), history=messages, pending_actions=None)

        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

        # FR16.4: if any call in this turn is destructive, pause the whole
        # batch for confirmation rather than partially executing it.
        if any(b.name in DESTRUCTIVE_TOOLS for b in tool_use_blocks):
            pending = [PendingAction(tool_use_id=b.id, tool_name=b.name, tool_input=b.input) for b in tool_use_blocks]
            return AgentResult(reply=_confirmation_prompt(pending), history=messages, pending_actions=pending)

        tool_results = []
        for block in tool_use_blocks:
            result, is_error = execute_tool(client, user_id, block.name, block.input)
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": _to_content_str(result),
                    "is_error": is_error,
                }
            )
        messages.append({"role": "user", "content": tool_results})

    return AgentResult(
        reply="I wasn't able to finish that in a reasonable number of steps — please try rephrasing.",
        history=messages,
        pending_actions=None,
    )


def _confirmation_prompt(pending: list[PendingAction]) -> str:
    names = ", ".join(f"{p.tool_name} ({p.tool_input})" for p in pending)
    return f"This requires confirmation before it runs: {names}. Confirm or cancel?"
