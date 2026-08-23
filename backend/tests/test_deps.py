from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_chat_without_authorization_header_is_rejected():
    response = client.post("/assistant/chat", json={"text": "hello"})
    assert response.status_code in (401, 422)


def test_chat_with_malformed_bearer_token_is_rejected():
    response = client.post(
        "/assistant/chat",
        json={"text": "hello"},
        headers={"Authorization": "NotBearer whatever"},
    )
    assert response.status_code == 401


def test_chat_with_invalid_token_is_rejected():
    response = client.post(
        "/assistant/chat",
        json={"text": "hello"},
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert response.status_code == 401


def test_confirm_with_invalid_token_is_rejected():
    response = client.post(
        "/assistant/confirm",
        json={"approved": True, "pending_actions": [], "history": []},
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert response.status_code == 401


def test_transcribe_with_invalid_token_is_rejected():
    response = client.post(
        "/assistant/transcribe",
        files={"audio": ("clip.webm", b"fake-audio-bytes", "audio/webm")},
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert response.status_code == 401
