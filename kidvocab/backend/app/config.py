"""Runtime configuration.

Every commercial number (free quota, daily goal, SRS ladder) is configuration,
never a literal buried in business logic -- see spec section 45.2 / 46.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="KIDVOCAB_", extra="ignore")

    app_name: str = "KidVocab API"
    debug: bool = True

    # SQLite by default so the MVP runs with zero infrastructure.
    # Point this at postgresql+psycopg://... in any shared environment.
    database_url: str = "sqlite:///./kidvocab.db"

    # Where uploaded images land. Swap for S3/OSS by replacing app.storage.
    media_root: str = "./media"
    media_base_url: str = "/media"

    # AI pipeline
    ai_provider: Literal["mock", "anthropic"] = "mock"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5"
    ai_max_images_per_import: int = 10

    # Learning defaults
    default_daily_goal: int = 20
    seconds_per_item_estimate: int = 24

    # Commercial defaults (section 45.3). Read at entitlement-grant time only.
    free_ai_image_import_quota: int = 3

    @property
    def srs_intervals_days(self) -> list[int]:
        """Section 27. Level index -> days until the next review."""
        return [0, 1, 2, 4, 7, 15, 30]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
