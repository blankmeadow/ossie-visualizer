"""The import pipeline (spec section 8).

    image -> OCR/Vision -> restored text -> sentence split -> word/phrase
    detection -> lemmatisation -> Chinese meaning -> learning-value judgement
    -> personal-library dedupe -> original-sentence linking -> candidates

The Vision model supplies steps 1-3 and *proposes* items. Everything after that
is deterministic and testable, which is what keeps the personal library clean
whichever provider is plugged in.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..data.lexicon import DICTIONARY, PHRASE_LEXICON
from ..enums import AnalysisStatus, VocabType
from ..models import (
    AnalysisCandidate,
    Child,
    ChildVocabulary,
    Sentence,
    Source,
    SourceImage,
    VocabularyItem,
)
from .filters import judge, rank_key
from .lemmatizer import lemmatize, tokenize
from .phrases import find_phrases
from .providers import get_provider
from .providers.base import ImageInput, ProviderError, ProviderResult
from .segmenter import is_usable_example, split_sentences

logger = logging.getLogger(__name__)

#: Cap on how many candidates a single import may propose, so the confirm
#: screen stays a 20-second decision (section 12).
MAX_CANDIDATES = 24


@dataclass
class OccurrenceDraft:
    sentence_id: str
    sentence: str
    surface_form: str
    start_offset: int
    end_offset: int
    usable_example: bool


@dataclass
class CandidateDraft:
    lemma: str
    type: VocabType
    meaning: str = ""
    phonetic: str | None = None
    recommended: bool = True
    reason: str | None = None
    already_in_library: bool = False
    occurrences: list[OccurrenceDraft] = field(default_factory=list)
    surface_forms: list[str] = field(default_factory=list)
    sentence_starts: list[bool] = field(default_factory=list)


@dataclass
class AnalysisOutcome:
    status: AnalysisStatus
    candidates: list[CandidateDraft]
    sentence_count: int
    error: str | None = None

    @property
    def should_consume_quota(self) -> bool:
        """Section 47: only a successful analysis that produced usable
        candidates costs the parent one of their imports."""
        return self.status is AnalysisStatus.READY and bool(self.candidates)


def analyze_source(db: Session, source: Source, child: Child) -> AnalysisOutcome:
    """Run the full pipeline and persist sentences + candidates for *source*."""
    images = list(
        db.scalars(
            select(SourceImage).where(SourceImage.source_id == source.id).order_by(SourceImage.page_no)
        )
    )
    if not images:
        return AnalysisOutcome(AnalysisStatus.FAILED, [], 0, error="no_images")

    provider = get_provider()
    try:
        result = provider.extract(
            [ImageInput(path=img.image_url, page_no=img.page_no) for img in images],
            grade=child.grade,
        )
    except ProviderError as exc:
        logger.warning("analysis failed for source %s: %s", source.id, exc)
        return AnalysisOutcome(AnalysisStatus.FAILED, [], 0, error=str(exc))

    _store_ocr_text(db, images, result)
    sentences = _persist_sentences(db, source, images, result)
    if not sentences:
        return AnalysisOutcome(AnalysisStatus.EMPTY, [], 0)

    drafts = extract_candidates(sentences, grade=child.grade, provider_result=result)
    _mark_existing(db, child.id, drafts)
    drafts = _rank_and_trim(drafts, child.grade)

    if not drafts:
        return AnalysisOutcome(AnalysisStatus.EMPTY, [], len(sentences))

    _persist_candidates(db, source, drafts)
    return AnalysisOutcome(AnalysisStatus.READY, drafts, len(sentences))


# ---------------------------------------------------------------------------
# Extraction -- pure, so it can be tested without a database
# ---------------------------------------------------------------------------
def extract_candidates(
    sentences: list[Sentence],
    *,
    grade: int,
    provider_result: ProviderResult | None = None,
) -> list[CandidateDraft]:
    drafts: dict[tuple[str, VocabType], CandidateDraft] = {}

    for sentence in sentences:
        text = sentence.text
        usable = is_usable_example(text)
        consumed: set[int] = set()

        # Phrases first -- they win over their component words (section 9.3).
        for match in find_phrases(text):
            draft = drafts.setdefault(
                (match.lemma, VocabType.PHRASE),
                CandidateDraft(lemma=match.lemma, type=VocabType.PHRASE),
            )
            draft.occurrences.append(
                OccurrenceDraft(
                    sentence_id=sentence.id,
                    sentence=text,
                    surface_form=match.surface_form,
                    start_offset=match.start_offset,
                    end_offset=match.end_offset,
                    usable_example=usable,
                )
            )
            draft.surface_forms.append(match.surface_form)
            draft.sentence_starts.append(match.start_offset == 0)
            consumed.update(range(match.start_offset, match.end_offset))

        for token, start, end in tokenize(text):
            if start in consumed:
                continue
            lemma = lemmatize(token)
            if not lemma:
                continue
            draft = drafts.setdefault(
                (lemma, VocabType.WORD), CandidateDraft(lemma=lemma, type=VocabType.WORD)
            )
            draft.occurrences.append(
                OccurrenceDraft(
                    sentence_id=sentence.id,
                    sentence=text,
                    surface_form=token,
                    start_offset=start,
                    end_offset=end,
                    usable_example=usable,
                )
            )
            draft.surface_forms.append(token)
            draft.sentence_starts.append(start == 0)

    _apply_provider_items(drafts, provider_result)
    _fill_meanings(drafts)

    for (lemma, vocab_type), draft in drafts.items():
        recommended, reason = judge(
            lemma,
            vocab_type,
            grade,
            surface_forms=draft.surface_forms,
            sentence_starts=draft.sentence_starts,
        )
        # An item we cannot gloss is not something to put in front of a parent.
        if recommended and not draft.meaning:
            recommended, reason = False, "no_meaning"
        draft.recommended = recommended
        draft.reason = reason

    return list(drafts.values())


def _apply_provider_items(
    drafts: dict[tuple[str, VocabType], CandidateDraft], result: ProviderResult | None
) -> None:
    """Trust the model for meanings; trust our own detector for what exists.

    A model-proposed item we never saw in the restored text is dropped: without
    an occurrence it would break the original-sentence promise (section 10).
    """
    if not result:
        return
    for item in result.items:
        lemma = item.lemma.lower().strip()
        vocab_type = VocabType.PHRASE if item.type == "PHRASE" else VocabType.WORD
        draft = drafts.get((lemma, vocab_type))
        if draft is None:
            continue
        if item.meaning:
            draft.meaning = item.meaning
        if item.phonetic:
            draft.phonetic = item.phonetic


def _fill_meanings(drafts: dict[tuple[str, VocabType], CandidateDraft]) -> None:
    for (lemma, vocab_type), draft in drafts.items():
        if draft.meaning:
            continue
        if vocab_type is VocabType.PHRASE:
            draft.meaning = PHRASE_LEXICON.get(lemma, "")
        else:
            entry = DICTIONARY.get(lemma)
            if entry:
                draft.meaning, draft.phonetic = entry[0], draft.phonetic or entry[1]


def _rank_and_trim(drafts: list[CandidateDraft], grade: int) -> list[CandidateDraft]:
    recommended = [d for d in drafts if d.recommended]
    recommended.sort(key=lambda d: rank_key(d.lemma, d.type, len(d.occurrences), grade))
    return recommended[:MAX_CANDIDATES]


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------
def _store_ocr_text(db: Session, images: list[SourceImage], result: ProviderResult) -> None:
    by_page = {p.page_no: p.text for p in result.pages}
    for image in images:
        image.ocr_text = by_page.get(image.page_no, "")
    db.flush()


def _persist_sentences(
    db: Session, source: Source, images: list[SourceImage], result: ProviderResult
) -> list[Sentence]:
    image_by_page = {img.page_no: img for img in images}
    rows: list[Sentence] = []
    order = 0
    seen: set[str] = set()
    for page in sorted(result.pages, key=lambda p: p.page_no):
        for text in split_sentences(page.text):
            key = text.lower()
            if key in seen:
                continue
            seen.add(key)
            image = image_by_page.get(page.page_no)
            row = Sentence(
                source_id=source.id,
                source_image_id=image.id if image else None,
                text=text,
                order_no=order,
            )
            order += 1
            db.add(row)
            rows.append(row)
    db.flush()
    return rows


def _mark_existing(db: Session, child_id: str, drafts: list[CandidateDraft]) -> None:
    """Section 11.1 -- an item the child already has is merged, never duplicated."""
    if not drafts:
        return
    existing = set(
        db.execute(
            select(VocabularyItem.lemma, VocabularyItem.type)
            .join(ChildVocabulary, ChildVocabulary.vocabulary_item_id == VocabularyItem.id)
            .where(ChildVocabulary.child_id == child_id)
        ).all()
    )
    for draft in drafts:
        draft.already_in_library = (draft.lemma, draft.type) in existing


def _persist_candidates(db: Session, source: Source, drafts: list[CandidateDraft]) -> None:
    db.query(AnalysisCandidate).filter(AnalysisCandidate.source_id == source.id).delete()
    for rank, draft in enumerate(drafts):
        db.add(
            AnalysisCandidate(
                source_id=source.id,
                lemma=draft.lemma,
                type=draft.type,
                meaning=draft.meaning,
                phonetic=draft.phonetic,
                recommended=draft.recommended,
                already_in_library=draft.already_in_library,
                reason=draft.reason,
                rank=rank,
                occurrences=[
                    {
                        "sentence_id": o.sentence_id,
                        "sentence": o.sentence,
                        "surface_form": o.surface_form,
                        "start_offset": o.start_offset,
                        "end_offset": o.end_offset,
                        "usable_example": o.usable_example,
                    }
                    for o in draft.occurrences
                ],
            )
        )
    db.flush()
