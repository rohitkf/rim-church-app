from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str | None = None
    llm_api_key: str | None = None
    # claude-opus-5 is the current default per Anthropic's own guidance —
    # override only if you deliberately want a cheaper/faster model.
    anthropic_model: str = "claude-opus-5"

    # faster-whisper model size for self-hosted STT (Open Question 4
    # decision). Larger = more accurate, slower, more RAM. The model is
    # downloaded from Hugging Face on first use, not at startup — see
    # transcribe.py.
    whisper_model_size: str = "base"

    # Comma-separated list of origins allowed to call this API, e.g.
    # "http://localhost:5173,https://ops.example.org". Defaults to the Vite
    # dev server so local development works out of the box; production
    # deployments must set this explicitly rather than relying on the
    # default, which is intentionally not a wildcard.
    cors_origins_raw: str = "http://localhost:5173"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]


settings = Settings()  # type: ignore[call-arg]
