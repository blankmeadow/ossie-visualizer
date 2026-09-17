from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ImageInput:
    path: str
    page_no: int
    media_type: str = "image/jpeg"


@dataclass
class PageText:
    page_no: int
    text: str


@dataclass
class ProviderItem:
    """A candidate the model proposes, before deterministic normalisation."""

    lemma: str
    type: str  # "WORD" | "PHRASE"
    meaning: str = ""
    phonetic: str | None = None


@dataclass
class ProviderResult:
    pages: list[PageText] = field(default_factory=list)
    items: list[ProviderItem] = field(default_factory=list)

    @property
    def full_text(self) -> str:
        return "\n".join(p.text for p in sorted(self.pages, key=lambda p: p.page_no))


class ProviderError(RuntimeError):
    """Raised when the model could not be reached or returned nothing usable.

    Callers must treat this as "do not consume the import quota" (section 47).
    """


class VisionProvider(ABC):
    """OCR + text restoration + a first pass at what is worth learning.

    Section 34: one Vision LLM call does all of this in the MVP. Splitting it
    into OCR / dictionary / NLP services is a cost optimisation for later.
    """

    name: str = "base"

    @abstractmethod
    def extract(self, images: list[ImageInput], grade: int) -> ProviderResult: ...
