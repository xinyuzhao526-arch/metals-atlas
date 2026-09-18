from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./metals_atlas.db"
    session_secret: str = "development-secret-change-before-production"
    admin_email: str = "admin@example.com"
    admin_password: str = "development-only-password"
    upload_dir: Path = Path("./uploads")
    source_storage_dir: Path = Path("./source_storage")
    web_origin: str = "http://localhost:3000"
    session_cookie_secure: bool = False
    extraction_api_key: str | None = None
    extraction_model: str | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
