"""Phrase detection (spec section 9.3).

The product rule is blunt: if a sentence contains "looking for", the item is
``look for``, not ``look``. So phrases are matched first, longest-first, and the
tokens they consume are removed from single-word consideration.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..data.lexicon import PHRASE_LEXICON
from .lemmatizer import lemmatize, tokenize

#: Auxiliaries that may sit between "be" and the adjective of a be-phrase, or
#: between a verb and its particle, without breaking the match.
_SKIPPABLE = {"not", "really", "very", "so", "always", "never", "just", "still"}

_BE_FORMS = {"be", "is", "am", "are", "was", "were", "been", "being", "'s", "'re", "'m"}


@dataclass(frozen=True)
class PhraseMatch:
    lemma: str
    surface_form: str
    start_offset: int
    end_offset: int
    token_span: tuple[int, int]  # [start, end) over the token list


def _phrase_tokens_match(pattern: list[str], tokens: list[str], i: int) -> int | None:
    """Try to match *pattern* against *tokens* starting at index *i*.

    Returns the exclusive end index on success. Tolerates inflection on the head
    verb, ``be``-form variation, and a skippable adverb between parts.
    """
    ti = i
    for pi, expected in enumerate(pattern):
        # Allow one skippable adverb before each non-initial pattern token.
        while pi > 0 and ti < len(tokens) and tokens[ti] in _SKIPPABLE:
            ti += 1
        if ti >= len(tokens):
            return None
        actual = tokens[ti]
        if expected == "be":
            if actual not in _BE_FORMS:
                return None
        elif pi == 0:
            # Head word may be inflected: looking/looked/looks -> look
            if actual != expected and lemmatize(actual) != expected:
                return None
        elif expected == "one's":
            if actual not in {"my", "your", "his", "her", "its", "our", "their"}:
                return None
        elif actual != expected:
            return None
        ti += 1
    return ti


def find_phrases(sentence: str) -> list[PhraseMatch]:
    """Return non-overlapping phrase matches, preferring the longest."""
    spans = tokenize(sentence)
    tokens = [t.lower() for t, _s, _e in spans]

    patterns = sorted(
        (p.split() for p in PHRASE_LEXICON), key=len, reverse=True
    )

    matches: list[PhraseMatch] = []
    consumed: set[int] = set()

    for pattern in patterns:
        lemma = " ".join(pattern)
        for i in range(len(tokens)):
            if i in consumed:
                continue
            end = _phrase_tokens_match(pattern, tokens, i)
            if end is None:
                continue
            if any(k in consumed for k in range(i, end)):
                continue
            start_off = spans[i][1]
            end_off = spans[end - 1][2]
            matches.append(
                PhraseMatch(
                    lemma=lemma,
                    surface_form=sentence[start_off:end_off],
                    start_offset=start_off,
                    end_offset=end_off,
                    token_span=(i, end),
                )
            )
            consumed.update(range(i, end))

    matches.sort(key=lambda m: m.start_offset)
    return matches
