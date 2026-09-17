from __future__ import annotations

from ...config import settings
from .base import PageText, ProviderItem, ProviderResult, VisionProvider
from .mock import MockVisionProvider

__all__ = [
    "PageText",
    "ProviderItem",
    "ProviderResult",
    "VisionProvider",
    "MockVisionProvider",
    "get_provider",
]


def get_provider(name: str | None = None) -> VisionProvider:
    name = name or settings.ai_provider
    if name == "anthropic":
        from .anthropic_vision import AnthropicVisionProvider

        return AnthropicVisionProvider()
    return MockVisionProvider()
