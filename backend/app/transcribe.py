"""
Self-hosted speech-to-text via faster-whisper (Open Question 4 decision:
open-source Whisper, run server-side rather than relying on the browser's
Web Speech API for cross-browser consistency).

The model is loaded lazily on first use, not at import/startup time — it
downloads weights from Hugging Face on first run (cached under
~/.cache/huggingface afterwards) and CPU inference has real latency, so we
don't want either of those blocking app startup or health checks.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from faster_whisper import WhisperModel

from .config import settings

_model: WhisperModel | None = None


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(settings.whisper_model_size, device="cpu", compute_type="int8")
    return _model


def transcribe_audio(audio_bytes: bytes, suffix: str = ".webm") -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = Path(tmp.name)

    try:
        segments, _info = _get_model().transcribe(str(tmp_path))
        return " ".join(segment.text.strip() for segment in segments).strip()
    finally:
        tmp_path.unlink(missing_ok=True)
