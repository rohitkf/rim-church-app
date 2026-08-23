from unittest.mock import MagicMock, patch

from app import transcribe


def _fake_segment(text: str):
    seg = MagicMock()
    seg.text = text
    return seg


def test_transcribe_audio_joins_segments_and_strips_whitespace():
    fake_model = MagicMock()
    fake_model.transcribe.return_value = (
        [_fake_segment("  Hello there.  "), _fake_segment("How are you?")],
        MagicMock(),
    )

    with patch.object(transcribe, "_get_model", return_value=fake_model):
        result = transcribe.transcribe_audio(b"fake-audio-bytes")

    assert result == "Hello there. How are you?"
    fake_model.transcribe.assert_called_once()


def test_transcribe_audio_handles_no_speech_detected():
    fake_model = MagicMock()
    fake_model.transcribe.return_value = ([], MagicMock())

    with patch.object(transcribe, "_get_model", return_value=fake_model):
        result = transcribe.transcribe_audio(b"silence")

    assert result == ""


def test_model_is_loaded_lazily_only_once():
    # _get_model must not construct a WhisperModel at import time (it would
    # try to download weights from Hugging Face, which shouldn't happen
    # just from importing the module) — only on first actual call, and
    # cached after that.
    transcribe._model = None
    with patch("app.transcribe.WhisperModel") as MockWhisperModel:
        MockWhisperModel.return_value = MagicMock()
        first = transcribe._get_model()
        second = transcribe._get_model()

    MockWhisperModel.assert_called_once()
    assert first is second
    transcribe._model = None
