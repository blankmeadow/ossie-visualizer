"""Rule-based lemmatisation (spec section 11).

Deliberately not a dependency on spaCy/NLTK: the MVP needs a small, fast,
fully-offline normaliser whose behaviour is pinned by tests. It handles the
inflection patterns that actually show up in primary-school material.
"""
from __future__ import annotations

import re

from ..data.lexicon import DICTIONARY, IRREGULAR_NOUNS, IRREGULAR_VERBS, NEVER_STRIP, PHRASE_LEXICON

_VOWELS = set("aeiou")
_KNOWN = set(DICTIONARY) | {w for p in PHRASE_LEXICON for w in p.split()}

_WORD_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")


def tokenize(text: str) -> list[tuple[str, int, int]]:
    """Return ``(token, start_offset, end_offset)`` for every word in *text*."""
    return [(m.group(0), m.start(), m.end()) for m in _WORD_RE.finditer(text)]


def _undouble(stem: str) -> str:
    """running -> run, but felling -> fell stays put unless the short form is known."""
    if len(stem) >= 3 and stem[-1] == stem[-2] and stem[-1] not in "lsz":
        return stem[:-1]
    return stem


def _restore_e(stem: str) -> str:
    """mak -> make, hop -> hope: add a silent -e when that yields a known word."""
    candidate = stem + "e"
    if candidate in _KNOWN:
        return candidate
    return stem


def lemmatize(word: str) -> str:
    """Normalise a single surface form to its dictionary form."""
    w = word.lower().strip("'")
    if not w:
        return ""
    if w in IRREGULAR_VERBS:
        return IRREGULAR_VERBS[w]
    if w in IRREGULAR_NOUNS:
        return IRREGULAR_NOUNS[w]
    if w in _KNOWN or w in NEVER_STRIP or len(w) <= 3:
        return w

    # -ing
    if w.endswith("ing") and len(w) > 5:
        stem = w[:-3]
        for cand in (stem, _undouble(stem), _restore_e(stem), _restore_e(_undouble(stem))):
            if cand in _KNOWN:
                return cand
        return _restore_e(_undouble(stem)) if stem[-1] not in _VOWELS else stem

    # -ied / -ies  (carried -> carry, flies -> fly)
    if w.endswith("ied") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"

    # -ed
    if w.endswith("ed") and len(w) > 4:
        stem = w[:-2]
        for cand in (stem, _undouble(stem), _restore_e(stem), _restore_e(_undouble(stem))):
            if cand in _KNOWN:
                return cand
        if stem.endswith(("t", "d")):
            return stem
        return _restore_e(_undouble(stem)) if len(stem) > 2 else stem

    # -es / -s
    if w.endswith("es") and len(w) > 3:
        stem = w[:-2]
        if stem in _KNOWN or stem.endswith(("s", "x", "z", "ch", "sh")):
            return stem
        return w[:-1]
    if w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        return w[:-1]

    return w


def lemmatize_phrase(phrase: str) -> str:
    """``is looking for`` -> ``look for``; ``looked after`` -> ``look after``."""
    tokens = phrase.lower().split()
    if not tokens:
        return ""
    # Drop a leading auxiliary that only marks tense/aspect.
    while len(tokens) > 1 and tokens[0] in {"is", "am", "are", "was", "were", "been", "being"}:
        # "be afraid of" keeps its "be" -- detect that by checking the lexicon.
        rest = " ".join(["be"] + tokens[1:])
        if rest in PHRASE_LEXICON:
            tokens = ["be"] + tokens[1:]
            break
        tokens = tokens[1:]
    head, *tail = tokens
    return " ".join([lemmatize(head), *tail]).strip()
