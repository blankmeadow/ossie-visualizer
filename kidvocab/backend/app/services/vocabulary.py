"""Writing into the personal library.

The merge rule from spec section 11.1 is the important part: a word the child
already has is *never* duplicated and the parent is *never* asked whether to
overwrite. It quietly gains a sighting, a fresher timestamp, and a new original
sentence.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..ai.lemmatizer import lemmatize, lemmatize_phrase, tokenize
from ..ai.phrases import find_phrases
from ..ai.segmenter import is_usable_example
from ..data.lexicon import DICTIONARY, PHRASE_LEXICON
from ..enums import LearnStatus, SourceType, VocabType
from ..models import (
    AnalysisCandidate,
    Child,
    ChildVocabulary,
    Sentence,
    Source,
    VocabularyItem,
    VocabularyOccurrence,
)


@dataclass
class AddResult:
    child_vocabulary: ChildVocabulary
    item: VocabularyItem
    created: bool
    new_occurrences: int


def get_or_create_item(
    db: Session,
    *,
    lemma: str,
    vocab_type: VocabType,
    meaning: str = "",
    phonetic: str | None = None,
) -> VocabularyItem:
    item = db.scalar(
        select(VocabularyItem).where(
            VocabularyItem.lemma == lemma, VocabularyItem.type == vocab_type
        )
    )
    if item is None:
        item = VocabularyItem(
            lemma=lemma, type=vocab_type, meaning=meaning or "", phonetic=phonetic
        )
        db.add(item)
        db.flush()
        return item

    # Fill gaps, never clobber a meaning that is already there.
    if meaning and not item.meaning:
        item.meaning = meaning
    if phonetic and not item.phonetic:
        item.phonetic = phonetic
    return item


def add_to_library(
    db: Session,
    child: Child,
    *,
    lemma: str,
    vocab_type: VocabType,
    meaning: str = "",
    phonetic: str | None = None,
    occurrences: list[dict] | None = None,
    now: datetime | None = None,
) -> AddResult:
    now = now or datetime.now(UTC)
    item = get_or_create_item(
        db, lemma=lemma, vocab_type=vocab_type, meaning=meaning, phonetic=phonetic
    )

    cv = db.scalar(
        select(ChildVocabulary).where(
            ChildVocabulary.child_id == child.id,
            ChildVocabulary.vocabulary_item_id == item.id,
        )
    )
    created = cv is None
    if created:
        cv = ChildVocabulary(
            child_id=child.id,
            vocabulary_item_id=item.id,
            status=LearnStatus.NEW,
            first_seen_at=now,
            last_seen_at=now,
            seen_count=1,
        )
        db.add(cv)
        db.flush()
    else:
        # Section 11.1 -- "又遇到了", handled silently.
        cv.seen_count += 1
        cv.last_seen_at = now

    added = _link_occurrences(db, child.id, item.id, occurrences or [])
    return AddResult(child_vocabulary=cv, item=item, created=created, new_occurrences=added)


def _link_occurrences(db: Session, child_id: str, item_id: str, occurrences: list[dict]) -> int:
    if not occurrences:
        return 0
    existing = set(
        db.scalars(
            select(VocabularyOccurrence.sentence_id).where(
                VocabularyOccurrence.child_id == child_id,
                VocabularyOccurrence.vocabulary_item_id == item_id,
            )
        )
    )
    added = 0
    for occurrence in occurrences:
        sentence_id = occurrence.get("sentence_id")
        if not sentence_id or sentence_id in existing:
            continue
        existing.add(sentence_id)
        db.add(
            VocabularyOccurrence(
                child_id=child_id,
                vocabulary_item_id=item_id,
                sentence_id=sentence_id,
                surface_form=occurrence.get("surface_form", ""),
                start_offset=int(occurrence.get("start_offset", 0)),
                end_offset=int(occurrence.get("end_offset", 0)),
            )
        )
        added += 1
    db.flush()
    return added


def confirm_candidates(
    db: Session, child: Child, source: Source, candidate_ids: list[str] | None
) -> list[AddResult]:
    """Section 12 -- everything recommended is pre-selected; the parent's only
    job is to untick what they do not want."""
    query = select(AnalysisCandidate).where(AnalysisCandidate.source_id == source.id)
    if candidate_ids is not None:
        query = query.where(AnalysisCandidate.id.in_(candidate_ids))
    candidates = list(db.scalars(query.order_by(AnalysisCandidate.rank)))

    results: list[AddResult] = []
    for candidate in candidates:
        results.append(
            add_to_library(
                db,
                child,
                lemma=candidate.lemma,
                vocab_type=VocabType(candidate.type),
                meaning=candidate.meaning,
                phonetic=candidate.phonetic,
                occurrences=[o for o in candidate.occurrences if o.get("usable_example")]
                or candidate.occurrences,
            )
        )
    return results


# ---------------------------------------------------------------------------
# Manual add (section 13)
# ---------------------------------------------------------------------------
def classify_input(text: str) -> tuple[str, VocabType]:
    """``take care of`` -> PHRASE, ``forest`` -> WORD, with normalisation."""
    cleaned = " ".join(text.strip().split())
    if not cleaned:
        return "", VocabType.WORD
    if len(cleaned.split()) > 1:
        return lemmatize_phrase(cleaned), VocabType.PHRASE
    return lemmatize(cleaned), VocabType.WORD


def lookup(lemma: str, vocab_type: VocabType) -> tuple[str, str | None]:
    """Section 13 -- the system fills in what it can so the parent does not."""
    if vocab_type is VocabType.PHRASE:
        return PHRASE_LEXICON.get(lemma, ""), None
    entry = DICTIONARY.get(lemma)
    return (entry[0], entry[1]) if entry else ("", None)


def manual_add(
    db: Session,
    child: Child,
    *,
    text: str,
    meaning: str | None = None,
    example: str | None = None,
    now: datetime | None = None,
) -> AddResult:
    now = now or datetime.now(UTC)
    lemma, vocab_type = classify_input(text)
    if not lemma:
        raise ValueError("empty input")

    auto_meaning, auto_phonetic = lookup(lemma, vocab_type)
    final_meaning = (meaning or "").strip() or auto_meaning

    occurrences: list[dict] = []
    if example and example.strip():
        source = Source(
            child_id=child.id,
            title=f"手动添加 · {now.strftime('%Y-%m-%d')}",
            source_type=SourceType.MANUAL,
        )
        db.add(source)
        db.flush()
        sentence = Sentence(source_id=source.id, text=example.strip(), order_no=0)
        db.add(sentence)
        db.flush()
        span = _locate(sentence.text, lemma, vocab_type)
        if span and is_usable_example(sentence.text):
            start, end = span
            occurrences.append(
                {
                    "sentence_id": sentence.id,
                    "surface_form": sentence.text[start:end],
                    "start_offset": start,
                    "end_offset": end,
                    "usable_example": True,
                }
            )

    return add_to_library(
        db,
        child,
        lemma=lemma,
        vocab_type=vocab_type,
        meaning=final_meaning,
        phonetic=auto_phonetic,
        occurrences=occurrences,
        now=now,
    )


def _locate(sentence: str, lemma: str, vocab_type: VocabType) -> tuple[int, int] | None:
    """Find where the item actually appears, allowing for inflection."""
    if vocab_type is VocabType.PHRASE:
        for match in find_phrases(sentence):
            if match.lemma == lemma:
                return match.start_offset, match.end_offset
        return None
    for token, start, end in tokenize(sentence):
        if lemmatize(token) == lemma:
            return start, end
    return None


def library_size(db: Session, child_id: str) -> int:
    return int(
        db.scalar(select(func.count(ChildVocabulary.id)).where(ChildVocabulary.child_id == child_id))
        or 0
    )
