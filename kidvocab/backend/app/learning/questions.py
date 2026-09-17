"""Question construction and difficulty routing (spec sections 15, 17-24).

The child never chooses a question type and never rates themselves
(section 16). The type is derived entirely from the four mastery scores, which
in turn come only from observed behaviour.

Progression (section 24):

    first learn -> T1 EN->ZH -> T2 ZH->EN -> T3 cloze -> T4 spell -> T5 context

with an automatic step *down* when the child fails the same item twice in a
row, so nobody is asked the hardest form repeatedly.
"""
from __future__ import annotations

import random
import re
from dataclasses import dataclass, field

from ..enums import QuestionType, VocabType
from ..models import ChildVocabulary
from . import distractors as dx
from .mastery import PASS_THRESHOLD, SPELL_PASS_THRESHOLD

#: How many progressive hints a spelling question offers before it is giving
#: the answer away (section 22).
MAX_HINTS = 3

_LETTER_BANK_SIZE = 6
_DECOY_LETTERS = "aeiourstnlmpdgbcfh"


@dataclass
class Example:
    sentence_id: str
    sentence: str
    surface_form: str
    start_offset: int
    end_offset: int


@dataclass
class QuestionContext:
    """Everything the builder needs, already loaded, so it stays pure."""

    child_vocabulary: ChildVocabulary
    lemma: str
    vocab_type: VocabType
    meaning: str
    phonetic: str | None = None
    audio_url: str | None = None
    examples: list[Example] = field(default_factory=list)
    #: (lemma, meaning) of other items in this child's library, for distractors.
    library: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class Question:
    child_vocabulary_id: str
    question_type: QuestionType
    lemma: str
    vocab_type: VocabType
    meaning: str
    phonetic: str | None
    audio_url: str | None
    prompt: dict
    options: list[str] = field(default_factory=list)
    hints: list[str] = field(default_factory=list)
    example: dict | None = None
    #: Never serialised to the client -- grading happens on the server.
    answer: str = ""

    def public_dict(self) -> dict:
        return {
            "child_vocabulary_id": self.child_vocabulary_id,
            "question_type": self.question_type.value,
            "lemma": self.lemma if self.question_type is QuestionType.FIRST_LEARN else None,
            "type": self.vocab_type.value,
            "meaning": self.meaning if self._reveals_meaning() else None,
            "phonetic": self.phonetic if self.question_type is QuestionType.FIRST_LEARN else None,
            "audio_url": self.audio_url,
            "prompt": self.prompt,
            "options": self.options,
            "hints": self.hints,
            "example": self.example,
        }

    def _reveals_meaning(self) -> bool:
        # T1 asks for the meaning, so it must not be handed over in the payload.
        return self.question_type is not QuestionType.T1_EN_TO_ZH


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------
def choose_question_type(cv: ChildVocabulary, *, has_example: bool) -> QuestionType:
    if cv.review_count == 0:
        return QuestionType.FIRST_LEARN

    if cv.meaning_score < PASS_THRESHOLD:
        chosen = QuestionType.T1_EN_TO_ZH
    elif cv.reverse_score < PASS_THRESHOLD:
        chosen = QuestionType.T2_ZH_TO_EN
    elif cv.spelling_score < PASS_THRESHOLD:
        chosen = QuestionType.T3_CLOZE
    elif cv.spelling_score < SPELL_PASS_THRESHOLD:
        chosen = QuestionType.T4_SPELL
    elif has_example and cv.context_score < PASS_THRESHOLD:
        chosen = QuestionType.T5_SENTENCE
    else:
        chosen = _maintenance_type(cv, has_example=has_example)

    return _downgrade_if_struggling(cv, chosen, has_example=has_example)


def _maintenance_type(cv: ChildVocabulary, *, has_example: bool) -> QuestionType:
    """Every gate passed: keep the item alive by testing its weakest skill."""
    order = [
        (cv.context_score, QuestionType.T5_SENTENCE if has_example else QuestionType.T4_SPELL),
        (cv.spelling_score, QuestionType.T4_SPELL),
        (cv.reverse_score, QuestionType.T2_ZH_TO_EN),
        (cv.meaning_score, QuestionType.T1_EN_TO_ZH),
    ]
    order.sort(key=lambda kv: kv[0])
    return order[0][1]


def _downgrade_if_struggling(
    cv: ChildVocabulary, chosen: QuestionType, *, has_example: bool
) -> QuestionType:
    """Section 24: two failures in a row means an easier form, not the same
    wall again."""
    if cv.consecutive_wrong < 2:
        return chosen
    ladder = {
        QuestionType.T5_SENTENCE: QuestionType.T3_CLOZE,
        QuestionType.T4_SPELL: QuestionType.T3_CLOZE,
        QuestionType.T3_CLOZE: QuestionType.T2_ZH_TO_EN,
        QuestionType.T2_ZH_TO_EN: QuestionType.T1_EN_TO_ZH,
        QuestionType.T1_EN_TO_ZH: QuestionType.T1_EN_TO_ZH,
    }
    return ladder.get(chosen, chosen)


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------
def build(ctx: QuestionContext, question_type: QuestionType, *, rng: random.Random | None = None) -> Question:
    rng = rng or random.Random()
    builder = {
        QuestionType.FIRST_LEARN: _build_first_learn,
        QuestionType.T1_EN_TO_ZH: _build_t1,
        QuestionType.T2_ZH_TO_EN: _build_t2,
        QuestionType.T3_CLOZE: _build_t3,
        QuestionType.T4_SPELL: _build_t4,
        QuestionType.T5_SENTENCE: _build_t5,
    }[question_type]
    return builder(ctx, rng)


def build_for(ctx: QuestionContext, *, rng: random.Random | None = None) -> Question:
    usable = [e for e in ctx.examples if _blankable(e)]
    qt = choose_question_type(ctx.child_vocabulary, has_example=bool(usable))
    return build(ctx, qt, rng=rng)


def _base(ctx: QuestionContext, qt: QuestionType, prompt: dict, **kw) -> Question:
    return Question(
        child_vocabulary_id=ctx.child_vocabulary.id,
        question_type=qt,
        lemma=ctx.lemma,
        vocab_type=ctx.vocab_type,
        meaning=ctx.meaning,
        phonetic=ctx.phonetic,
        audio_url=ctx.audio_url,
        prompt=prompt,
        **kw,
    )


def _example_dict(example: Example) -> dict:
    return {
        "sentence": example.sentence,
        "surface_form": example.surface_form,
        "start_offset": example.start_offset,
        "end_offset": example.end_offset,
    }


def _build_first_learn(ctx: QuestionContext, rng: random.Random) -> Question:
    """Section 15: an introduction card, not a test. Nothing is scored."""
    example = ctx.examples[0] if ctx.examples else None
    return _base(
        ctx,
        QuestionType.FIRST_LEARN,
        {"lemma": ctx.lemma, "meaning": ctx.meaning, "phonetic": ctx.phonetic},
        example=_example_dict(example) if example else None,
        answer="",
    )


def _build_t1(ctx: QuestionContext, rng: random.Random) -> Question:
    options = dx.meaning_options(
        lemma=ctx.lemma,
        vocab_type=ctx.vocab_type,
        meaning=ctx.meaning,
        pool=ctx.library,
        rng=rng,
    )
    return _base(
        ctx,
        QuestionType.T1_EN_TO_ZH,
        {"lemma": ctx.lemma},
        options=options,
        answer=ctx.meaning,
    )


def _build_t2(ctx: QuestionContext, rng: random.Random) -> Question:
    options = dx.spelling_options(
        lemma=ctx.lemma,
        vocab_type=ctx.vocab_type,
        pool=[lm for lm, _m in ctx.library],
        rng=rng,
    )
    return _base(
        ctx,
        QuestionType.T2_ZH_TO_EN,
        {"meaning": ctx.meaning},
        options=options,
        answer=ctx.lemma,
    )


def _build_t3(ctx: QuestionContext, rng: random.Random) -> Question:
    """Section 20. A word hides letters; a phrase hides its particle."""
    cv = ctx.child_vocabulary
    if ctx.vocab_type is VocabType.PHRASE:
        tokens = ctx.lemma.split()
        idx = dx.particle_to_blank(ctx.lemma)
        answer = tokens[idx]
        template = " ".join("____" if i == idx else t for i, t in enumerate(tokens))
        return _base(
            ctx,
            QuestionType.T3_CLOZE,
            {
                "meaning": ctx.meaning,
                "template": template,
                "blank_index": idx,
                "tokens": tokens,
                "mode": "text",
            },
            hints=_progressive_hints(answer),
            answer=answer,
        )

    revealed, bank = _mask_word(ctx.lemma, cv.spelling_score, rng)
    return _base(
        ctx,
        QuestionType.T3_CLOZE,
        {
            "meaning": ctx.meaning,
            "masked": revealed,
            "letter_bank": bank,
            "length": len(ctx.lemma),
            "mode": "letters",
        },
        hints=_progressive_hints(ctx.lemma),
        answer=ctx.lemma,
    )


def _build_t4(ctx: QuestionContext, rng: random.Random) -> Question:
    return _base(
        ctx,
        QuestionType.T4_SPELL,
        {"meaning": ctx.meaning, "length": len(ctx.lemma), "mode": "text"},
        hints=_progressive_hints(ctx.lemma),
        answer=ctx.lemma,
    )


def _build_t5(ctx: QuestionContext, rng: random.Random) -> Question:
    """Section 23 -- the original sentence, with the item blanked out."""
    usable = [e for e in ctx.examples if _blankable(e)]
    if not usable:
        return _build_t4(ctx, rng)
    example = usable[0] if len(usable) == 1 else rng.choice(usable)
    blanked = (
        example.sentence[: example.start_offset] + "______" + example.sentence[example.end_offset :]
    )
    # The blank hides the inflected form, so every option wears it.
    surface = example.surface_form
    options = dx.sentence_options(
        lemma=ctx.lemma,
        vocab_type=ctx.vocab_type,
        surface_form=surface,
        pool=[lm for lm, _m in ctx.library],
        rng=rng,
    )
    return _base(
        ctx,
        QuestionType.T5_SENTENCE,
        {"sentence": blanked, "meaning": ctx.meaning},
        options=options,
        example=_example_dict(example),
        answer=surface,
    )


def _blankable(example: Example) -> bool:
    return (
        example.end_offset > example.start_offset
        and example.end_offset <= len(example.sentence)
        and len(re.findall(r"[A-Za-z']+", example.sentence)) >= 4
    )


# ---------------------------------------------------------------------------
# Masking + hints
# ---------------------------------------------------------------------------
def _mask_word(word: str, spelling_score: float, rng: random.Random) -> tuple[list[str | None], list[str]]:
    """Hide a share of the letters that grows with familiarity (section 20).

    The first letter always survives: an entirely blank word is a T4, and the
    point of T3 is to be the gentler step.
    """
    letters = list(word)
    n = len(letters)
    ratio = min(0.34 + 0.35 * max(0.0, min(1.0, spelling_score)), 0.7)
    hide_count = max(1, min(n - 1, round(n * ratio)))

    positions = list(range(1, n))
    rng.shuffle(positions)
    hidden = sorted(positions[:hide_count])

    revealed: list[str | None] = [None if i in hidden else ch for i, ch in enumerate(letters)]
    missing = [letters[i] for i in hidden]

    bank = list(dict.fromkeys(missing))
    pool = [c for c in _DECOY_LETTERS if c not in bank]
    rng.shuffle(pool)
    while len(bank) < min(_LETTER_BANK_SIZE, len(bank) + len(pool)):
        bank.append(pool.pop())
    rng.shuffle(bank)
    return revealed, bank


def _progressive_hints(answer: str) -> list[str]:
    """``______`` -> ``f _ _ _ _ _`` -> ``f o _ _ _ _`` (section 22)."""
    hints: list[str] = []
    for reveal in range(1, min(MAX_HINTS, max(1, len(answer) - 1)) + 1):
        shown = [ch if i < reveal else "_" for i, ch in enumerate(answer)]
        hints.append(" ".join(shown))
    return hints


def normalize_answer(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def grade(question_answer: str, submitted: str) -> bool:
    return normalize_answer(question_answer) == normalize_answer(submitted)
