"""
AI assistant entry point (Section 16 / Phase 9).

Text chat and voice transcription for the assistant panel. Every tool call
runs through the caller-scoped Supabase client from
`deps.get_current_user`, so it can't exceed that user's own permissions
(FR16.3). Destructive tools (delete inventory item, delete checklist item)
pause for explicit confirmation before executing (FR16.4) — see
app/agent.py for the pause/resume mechanics.

This is a stateless HTTP API: the frontend holds the conversation history
and echoes it back on each request (see ChatRequest.history), rather than
the backend persisting chat sessions server-side.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel

from .. import agent
from ..deps import AuthedUser, get_current_user
from ..transcribe import transcribe_audio

router = APIRouter(prefix="/assistant", tags=["assistant"])


class PendingActionModel(BaseModel):
    tool_use_id: str
    tool_name: str
    tool_input: dict


class ChatRequest(BaseModel):
    text: str
    history: list[dict] = []


class ConfirmRequest(BaseModel):
    approved: bool
    pending_actions: list[PendingActionModel]
    history: list[dict]


class AssistantResponse(BaseModel):
    reply: str
    history: list[dict]
    pending_actions: list[PendingActionModel] | None = None


def _to_response(result: agent.AgentResult) -> AssistantResponse:
    return AssistantResponse(
        reply=result.reply,
        history=result.history,
        pending_actions=(
            [PendingActionModel(**vars(p)) for p in result.pending_actions] if result.pending_actions else None
        ),
    )


@router.post("/chat", response_model=AssistantResponse)
async def chat(request: ChatRequest, user: AuthedUser = Depends(get_current_user)) -> AssistantResponse:
    result = agent.start_turn(user.client, user.user_id, request.history, request.text)
    return _to_response(result)


@router.post("/confirm", response_model=AssistantResponse)
async def confirm(request: ConfirmRequest, user: AuthedUser = Depends(get_current_user)) -> AssistantResponse:
    pending = [agent.PendingAction(p.tool_use_id, p.tool_name, p.tool_input) for p in request.pending_actions]
    result = agent.resume_after_confirmation(user.client, user.user_id, request.history, pending, request.approved)
    return _to_response(result)


class TranscribeResponse(BaseModel):
    text: str


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    audio: UploadFile,
    _user: AuthedUser = Depends(get_current_user),
) -> TranscribeResponse:
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio upload")
    suffix = "." + (audio.filename.rsplit(".", 1)[-1] if audio.filename and "." in audio.filename else "webm")
    text = transcribe_audio(data, suffix=suffix)
    return TranscribeResponse(text=text)
