"""Learning-value judgement (spec section 9.2).

Decides which extracted items are *recommended* to the parent. Nothing is
thrown away silently in a way the parent cannot override -- non-recommended
items are still returned, just unchecked, so the confirm screen can offer them.
"""
from __future__ import annotations

import re

from ..data.lexicon import DICTIONARY, FUNCTION_WORDS, LOW_VALUE_WORDS, PHRASE_LEXICON
from ..enums import VocabType

_ALPHA_ONLY = re.compile(r"^[a-z][a-z'-]*$")

#: How far above the child's grade an item may sit and still be recommended.
GRADE_TOLERANCE = 2


class Rejection:
    FUNCTION_WORD = "function_word"
    LOW_VALUE = "low_value"
    PROPER_NOUN = "proper_noun"
    OCR_NOISE = "ocr_noise"
    TOO_SHORT = "too_short"
    TOO_ADVANCED = "too_advanced"


def looks_like_proper_noun(surface_forms: list[str], sentence_starts: list[bool]) -> bool:
    """Capitalised everywhere except where capitalisation is forced anyway."""
    mid_sentence = [
        (form, start) for form, start in zip(surface_forms, sentence_starts, strict=False) if not start
    ]
    if not mid_sentence:
        return False
    return all(form[:1].isupper() for form, _ in mid_sentence)


def is_ocr_noise(lemma: str) -> bool:
    if not _ALPHA_ONLY.match(lemma):
        return True
    if len(lemma) > 20:
        return True
    # No vowel at all (and not a known token) is almost always a scan artefact.
    if not set(lemma) & set("aeiouy") and lemma not in DICTIONARY:
        return True
    # Three identical letters in a row.
    if re.search(r"(.)\1\1", lemma):
        return True
    return False


def judge(
    lemma: str,
    vocab_type: VocabType,
    grade: int,
    *,
    surface_forms: list[str] | None = None,
    sentence_starts: list[bool] | None = None,
) -> tuple[bool, str | None]:
    """Return ``(recommended, rejection_reason)``."""
    if vocab_type is VocabType.PHRASE:
        # Every phrase in the inventory was put there because it is worth
        # learning; an unknown phrase from the model still earns a slot.
        return True, None

    low = lemma.lower()
    # A curated dictionary entry outranks the stopword list: "because" and
    # "always" are grammatical glue in a parser's eyes but are taught, and
    # tested, in primary school.
    curated = low in DICTIONARY
    if not curated:
        if low in FUNCTION_WORDS:
            return False, Rejection.FUNCTION_WORD
        if low in LOW_VALUE_WORDS:
            return False, Rejection.LOW_VALUE
    if len(low) < 3:
        return False, Rejection.TOO_SHORT
    if is_ocr_noise(low):
        return False, Rejection.OCR_NOISE
    if surface_forms and sentence_starts is not None:
        if looks_like_proper_noun(surface_forms, sentence_starts):
            return False, Rejection.PROPER_NOUN

    entry = DICTIONARY.get(low)
    if entry and entry[2] > grade + GRADE_TOLERANCE:
        return False, Rejection.TOO_ADVANCED

    return True, None


def rank_key(lemma: str, vocab_type: VocabType, occurrence_count: int, grade: int) -> tuple:
    """Ordering for the confirm screen: phrases first, then frequency.

    Phrases lead because they are the product's differentiator and the thing a
    parent is least likely to have collected by hand (section 9.3).
    """
    known_phrase = vocab_type is VocabType.PHRASE and lemma in PHRASE_LEXICON
    entry = DICTIONARY.get(lemma)
    grade_gap = abs((entry[2] if entry else grade) - grade)
    return (
        0 if vocab_type is VocabType.PHRASE else 1,
        0 if known_phrase else 1,
        -occurrence_count,
        grade_gap,
        lemma,
    )
