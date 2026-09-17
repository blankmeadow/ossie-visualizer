"""Mastery -- "how do we test this next?" (spec section 28).

Four independent skills, never collapsed into one percentage:

    meaning_score   English -> Chinese  (T1)
    reverse_score   Chinese -> English  (T2)
    spelling_score  cloze / full spell  (T3, T4)
    context_score   original sentence   (T5)

A child who recognises "forest" on sight but cannot spell it has a high
meaning_score and a low spelling_score, and the next question must reflect that.
That distinction is impossible to make from a single number.
"""
from __future__ import annotations

from ..enums import QUESTION_SKILL, QuestionType
from ..models import ChildVocabulary

#: A skill counts as met above this. Chosen so an item needs two clean answers
#: to pass a gate, and one mistake to fall back below it.
PASS_THRESHOLD = 0.6

#: Full-spelling is the hardest gate: it needs more evidence before we stop asking.
SPELL_PASS_THRESHOLD = 0.75

_GAIN_CLEAN = 0.4
_GAIN_HINTED = 0.15
_PENALTY = 0.5


def update(cv: ChildVocabulary, question_type: QuestionType, *, correct: bool, used_hint: bool) -> None:
    skill = QUESTION_SKILL.get(question_type)
    if skill is None:  # FIRST_LEARN trains nothing yet
        return
    current = float(getattr(cv, skill))
    if correct:
        gain = _GAIN_HINTED if used_hint else _GAIN_CLEAN
        value = current + (1.0 - current) * gain
    else:
        value = current * _PENALTY
    setattr(cv, skill, round(min(1.0, max(0.0, value)), 4))


def snapshot(cv: ChildVocabulary) -> dict[str, float]:
    return {
        "meaning_score": cv.meaning_score,
        "reverse_score": cv.reverse_score,
        "spelling_score": cv.spelling_score,
        "context_score": cv.context_score,
    }


def weakest_skill(cv: ChildVocabulary) -> str:
    return min(snapshot(cv).items(), key=lambda kv: kv[1])[0]
