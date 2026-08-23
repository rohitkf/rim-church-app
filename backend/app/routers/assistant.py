"""
AI assistant entry point (Section 16 / Phase 9).

Not implemented yet — this is scaffolding for the LangGraph/LangChain tool-
calling agent described in the PRD. Each tool this agent gets should mirror
one manual action from Sections 9-15 (FR16.2) and execute through the
caller-scoped Supabase client from `deps.get_current_user_client` so it
can't exceed that user's own permissions (FR16.3). Destructive tools
(delete inventory, remove member, reassign head) must require an explicit
confirmation step before executing (FR16.4).
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from supabase import Client

from ..deps import get_current_user_client

router = APIRouter(prefix="/assistant", tags=["assistant"])


class AssistantRequest(BaseModel):
    text: str


class AssistantResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=AssistantResponse)
async def chat(
    request: AssistantRequest,
    _client: Client = Depends(get_current_user_client),
) -> AssistantResponse:
    # TODO(Phase 9): route `request.text` (or transcribed voice input) through
    # the LangGraph agent with tool definitions for every FR in Sections 9-15.
    return AssistantResponse(
        reply="The AI assistant isn't wired up yet — this endpoint is scaffolding for Phase 9."
    )
