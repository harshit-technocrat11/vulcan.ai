"""Application configuration."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Vulcan AI application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "vulcan-ai"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = False

    log_level: str = "INFO"

    chat_model: str = "Qwen/Qwen2.5-7B-Instruct"
    chat_temperature: float = 0.2
    chat_timeout_seconds: float = 60.0

    featherless_api_key: str = ""
    featherless_base_url: str = "https://api.featherless.ai/v1"

    caspian_api_key: str = ""
    caspian_base_url: str = "https://api.trycaspianai.com"


settings = Settings()


def get_settings() -> Settings:
    return settings
