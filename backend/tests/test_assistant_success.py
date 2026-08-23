from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app import agent
from app.deps import AuthedUser, get_current_user
from app.main import app

client = TestClient(app)


def _fake_user() -> AuthedUser:
    return AuthedUser(client=MagicMock(), user_id="user-1")


def test_chat_success_path_returns_reply_and_history():
    app.dependency_overrides[get_current_user] = _fake_user
    fake_result = agent.AgentResult(reply="Hello!", history=[{"role": "assistant", "content": []}])

    try:
        with patch.object(agent, "start_turn", return_value=fake_result) as mock_start:
            response = client.post("/assistant/chat", json={"text": "hi", "history": []})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "Hello!"
    assert body["pending_actions"] is None
    mock_start.assert_called_once()
    # the auth-derived user_id, not something the client could spoof, is
    # what gets passed to the agent
    assert mock_start.call_args.args[1] == "user-1"


def test_chat_with_pending_destructive_action_is_surfaced_to_client():
    app.dependency_overrides[get_current_user] = _fake_user
    pending = [agent.PendingAction(tool_use_id="tu_1", tool_name="delete_checklist_item", tool_input={"item_id": "i1"})]
    fake_result = agent.AgentResult(reply="Confirm?", history=[], pending_actions=pending)

    try:
        with patch.object(agent, "start_turn", return_value=fake_result):
            response = client.post("/assistant/chat", json={"text": "delete it", "history": []})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["pending_actions"] == [
        {"tool_use_id": "tu_1", "tool_name": "delete_checklist_item", "tool_input": {"item_id": "i1"}}
    ]


def test_confirm_success_path_calls_resume_with_approval_flag():
    app.dependency_overrides[get_current_user] = _fake_user
    fake_result = agent.AgentResult(reply="Deleted.", history=[])
    pending_payload = [{"tool_use_id": "tu_1", "tool_name": "delete_checklist_item", "tool_input": {"item_id": "i1"}}]

    try:
        with patch.object(agent, "resume_after_confirmation", return_value=fake_result) as mock_resume:
            response = client.post(
                "/assistant/confirm",
                json={"approved": True, "pending_actions": pending_payload, "history": []},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["reply"] == "Deleted."
    mock_resume.assert_called_once()
    assert mock_resume.call_args.args[1] == "user-1"
    assert mock_resume.call_args.args[3][0].tool_name == "delete_checklist_item"
    assert mock_resume.call_args.args[4] is True


def test_transcribe_success_path_returns_text():
    app.dependency_overrides[get_current_user] = _fake_user

    try:
        with patch("app.routers.assistant.transcribe_audio", return_value="hello world") as mock_transcribe:
            response = client.post(
                "/assistant/transcribe",
                files={"audio": ("clip.webm", b"fake-audio-bytes", "audio/webm")},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"text": "hello world"}
    mock_transcribe.assert_called_once()


def test_transcribe_rejects_empty_audio():
    app.dependency_overrides[get_current_user] = _fake_user

    try:
        response = client.post(
            "/assistant/transcribe",
            files={"audio": ("clip.webm", b"", "audio/webm")},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
