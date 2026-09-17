"""Option generation for the multiple-choice types.

Spec section 19: "干扰项应尽量合理，不使用明显无意义答案." A four-option
question where three options are obviously absurd teaches nothing and inflates
the correct-answer rate, which would poison the very ReviewLog data the MVP
exists to collect.

Three strategies, in priority order:
  1. the child's own library -- a wrong answer they might actually confuse
  2. the same semantic group (T1) or the same orthographic neighbourhood (T2)
  3. the curated fallback banks
"""
from __future__ import annotations

import random

from ..data.lexicon import DICTIONARY, MEANING_GROUPS, PHRASE_LEXICON, PHRASE_PARTICLES, WORD_GROUP
from ..enums import VocabType

OPTION_COUNT = 4


def _edit_distance(a: str, b: str) -> int:
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]


def _orthographic_score(target: str, other: str) -> float:
    """Higher = more confusable. Mirrors the spec's own example, where
    ``forest`` is surrounded by ``field`` / ``first`` / ``follow``."""
    if other == target:
        return -1.0
    score = 0.0
    if other[:1] == target[:1]:
        score += 3.0
    if other[:2] == target[:2]:
        score += 2.0
    if other[-1:] == target[-1:]:
        score += 1.0
    score += max(0.0, 3.0 - _edit_distance(target, other) * 0.5)
    score -= abs(len(target) - len(other)) * 0.4
    return score


def _phrase_variants(lemma: str) -> list[str]:
    """``look for`` -> ``look at`` / ``look after`` / ``look like``.

    Same head verb, different particle: exactly the confusion T5 is meant to
    probe (spec section 23).
    """
    head = lemma.split()[0]
    return [p for p in PHRASE_LEXICON if p != lemma and p.split()[0] == head]


def meaning_options(
    *, lemma: str, vocab_type: VocabType, meaning: str, pool: list[tuple[str, str]], rng: random.Random
) -> list[str]:
    """T1: one correct Chinese meaning plus three plausible wrong ones."""
    group = WORD_GROUP.get(lemma, "phrase" if vocab_type is VocabType.PHRASE else None)

    candidates: list[str] = []
    # 1. the child's own library, same group first
    same_group = [m for lm, m in pool if m != meaning and WORD_GROUP.get(lm) == group]
    other_lib = [m for lm, m in pool if m != meaning and WORD_GROUP.get(lm) != group]
    rng.shuffle(same_group)
    rng.shuffle(other_lib)
    candidates.extend(same_group)

    # 2. the curated semantic group
    if group and group in MEANING_GROUPS:
        bank = [m for m in MEANING_GROUPS[group] if m != meaning]
        rng.shuffle(bank)
        candidates.extend(bank)

    candidates.extend(other_lib)

    # 3. anything, rather than fewer than four options
    fallback = [m for m in _ALL_MEANINGS if m != meaning]
    rng.shuffle(fallback)
    candidates.extend(fallback)

    return _assemble(meaning, candidates, rng)


def spelling_options(
    *, lemma: str, vocab_type: VocabType, pool: list[str], rng: random.Random
) -> list[str]:
    """T2: one correct English form plus three orthographically close ones."""
    if vocab_type is VocabType.PHRASE:
        candidates = _phrase_variants(lemma)
        rng.shuffle(candidates)
        library = [w for w in pool if w != lemma and " " in w]
        rng.shuffle(library)
        candidates.extend(library)
        candidates.extend(w for w in PHRASE_LEXICON if w != lemma)
    else:
        scored = sorted(
            ((w, _orthographic_score(lemma, w)) for w in set(pool) | set(DICTIONARY) if w != lemma),
            key=lambda kv: kv[1],
            reverse=True,
        )
        candidates = [w for w, _ in scored]

    return _assemble(lemma, candidates, rng)


def match_inflection(lemma: str, surface: str, other: str) -> str:
    """Bend *other* into the same shape the blank hides.

    Spec section 23 lists ``looking at / looking for / looking after /
    looking like`` -- all four in the same form. If the answer were the only
    inflected option, its form alone would give it away.
    """
    if surface.lower() == lemma.lower():
        return other

    lemma_head = lemma.split()[0]
    surface_head = surface.split()[0]
    other_parts = other.split()
    if len(other_parts) > 1 and len(surface.split()) > 1:
        # Phrase: swap the head verb, keep the particle.
        if other_parts[0].lower() == lemma_head.lower():
            return " ".join([surface_head, *other_parts[1:]])
        return other

    # Single word: reapply the same suffix when it is a clean addition.
    low_lemma, low_surface = lemma.lower(), surface.lower()
    for suffix in ("ing", "ed", "es", "s"):
        if low_surface == low_lemma + suffix:
            return other + suffix
        if low_surface == low_lemma[:-1] + suffix and low_lemma.endswith("e"):
            return other[:-1] + suffix if other.endswith("e") else other + suffix
    return other


def sentence_options(
    *,
    lemma: str,
    vocab_type: VocabType,
    surface_form: str,
    pool: list[str],
    rng: random.Random,
) -> list[str]:
    """T5: every option must fit the blank in the same grammatical shape."""
    if vocab_type is VocabType.PHRASE:
        # Same head verb first -- look at / look after / look like.
        candidates = _phrase_variants(lemma)
        rng.shuffle(candidates)
        candidates.extend(p for p in PHRASE_LEXICON if p != lemma and p not in candidates)
    else:
        candidates = [
            w
            for w, _score in sorted(
                ((w, _orthographic_score(lemma, w)) for w in set(pool) | set(DICTIONARY) if w != lemma),
                key=lambda kv: kv[1],
                reverse=True,
            )
        ]

    inflected: list[str] = []
    seen = {surface_form.lower()}
    for candidate in candidates:
        bent = match_inflection(lemma, surface_form, candidate)
        if bent.lower() in seen:
            continue
        seen.add(bent.lower())
        inflected.append(bent)

    return _assemble(surface_form, inflected, rng)


def _assemble(correct: str, candidates: list[str], rng: random.Random) -> list[str]:
    options = [correct]
    seen = {correct}
    for candidate in candidates:
        if len(options) >= OPTION_COUNT:
            break
        if candidate in seen or not candidate:
            continue
        seen.add(candidate)
        options.append(candidate)
    rng.shuffle(options)
    return options


def particle_to_blank(lemma: str) -> int:
    """Which token of a phrase a cloze should hide (spec section 20).

    Prefers the preposition/particle -- the part a child actually gets wrong --
    and falls back to the last token.
    """
    tokens = lemma.split()
    for i in range(len(tokens) - 1, -1, -1):
        if tokens[i] in PHRASE_PARTICLES:
            return i
    return len(tokens) - 1


_ALL_MEANINGS: list[str] = [m for m, _p, _g in DICTIONARY.values()] + list(PHRASE_LEXICON.values())
