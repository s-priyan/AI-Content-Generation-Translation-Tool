"""Application configuration loaded from environment variables.

`Settings` is the single source of truth for runtime configuration. Values are
read from a `.env` file or the process environment via pydantic-settings.
"""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings.

    All fields are immutable after instantiation. Access via `get_settings()`
    in dependency-injection code so test overrides are easy.
    """

    anthropic_api_key: str = Field(..., alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field("claude-sonnet-4-5", alias="ANTHROPIC_MODEL")

    database_url: str = Field(
        "sqlite+aiosqlite:///./app.db",
        alias="DATABASE_URL",
    )

    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        alias="CORS_ORIGINS",
    )

    max_file_size_mb: int = Field(20, alias="MAX_FILE_SIZE_MB")
    max_message_history: int = Field(50, alias="MAX_MESSAGE_HISTORY")
    log_level: str = Field("INFO", alias="LOG_LEVEL")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors(cls, value: object) -> object:
        """Allow CORS_ORIGINS to be set as a comma-separated string in .env."""
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                return stripped
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return value

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance.

    Tests can clear the cache via `get_settings.cache_clear()`.
    """
    return Settings()  # type: ignore[call-arg]
