from app.config import Settings


def _settings(**overrides) -> Settings:
    defaults = {"supabase_url": "https://x.supabase.co", "supabase_anon_key": "key"}
    return Settings(**{**defaults, **overrides})  # type: ignore[arg-type]


def test_cors_origins_splits_comma_separated_list():
    s = _settings(cors_origins_raw="http://a.com, http://b.com,http://c.com")
    assert s.cors_origins == ["http://a.com", "http://b.com", "http://c.com"]


def test_cors_origins_drops_empty_entries():
    s = _settings(cors_origins_raw="http://a.com,,  ,http://b.com")
    assert s.cors_origins == ["http://a.com", "http://b.com"]


def test_cors_origins_default_is_vite_dev_server():
    s = _settings()
    assert s.cors_origins == ["http://localhost:5173"]


def test_anthropic_model_defaults_to_opus_5():
    s = _settings()
    assert s.anthropic_model == "claude-opus-5"


def test_whisper_model_size_defaults_to_base():
    s = _settings()
    assert s.whisper_model_size == "base"


def test_optional_keys_default_to_none():
    s = _settings()
    assert s.llm_api_key is None
    assert s.supabase_service_role_key is None
