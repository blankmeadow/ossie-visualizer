"""SRS, mastery and question routing -- spec 16, 20, 22, 24, 27, 28."""
from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta

import pytest

from app.config import settings
from app.enums import QuestionType, VocabType
from app.learning import mastery, questions as q, srs
from app.learning.questions import Example, QuestionContext
from app.models import ChildVocabulary


def make_cv(**kw) -> ChildVocabulary:
    cv = ChildVocabulary(id="cv1", child_id="c1", vocabulary_item_id="v1")
    for field, value in kw.items():
        setattr(cv, field, value)
    for field in (
        "meaning_score", "reverse_score", "spelling_score", "context_score",
    ):
        if getattr(cv, field, None) is None:
            setattr(cv, field, 0.0)
    cv.srs_level = kw.get("srs_level", 0)
    cv.review_count = kw.get("review_count", 1)
    cv.consecutive_wrong = kw.get("consecutive_wrong", 0)
    return cv


# --------------------------------------------------------------------------
# SRS (section 27)
# --------------------------------------------------------------------------
def test_ladder_matches_spec():
    assert settings.srs_intervals_days == [0, 1, 2, 4, 7, 15, 30]


def test_correct_answers_climb_the_ladder():
    now = datetime(2026, 1, 1, tzinfo=UTC)
    level, seen = 0, []
    for _ in range(6):
        update = srs.next_state(srs_level=level, correct=True, used_hint=False, now=now)
        seen.append((update.next_review_at - now).days)
        level = update.srs_level
    assert seen == [1, 2, 4, 7, 15, 30]


def test_wrong_answer_shortens_the_interval():
    update = srs.next_state(srs_level=5, correct=False, used_hint=False)
    assert update.srs_level == 3


def test_hint_holds_position():
    """Section 22: a hinted answer must not grow the interval."""
    update = srs.next_state(srs_level=3, correct=True, used_hint=True)
    assert update.srs_level == 3


def test_level_zero_returns_within_the_same_round():
    now = datetime(2026, 1, 1, tzinfo=UTC)
    update = srs.next_state(srs_level=0, correct=False, used_hint=False, now=now)
    assert update.next_review_at - now < timedelta(hours=1)


# --------------------------------------------------------------------------
# Mastery (section 28)
# --------------------------------------------------------------------------
def test_skills_move_independently():
    cv = make_cv()
    mastery.update(cv, QuestionType.T1_EN_TO_ZH, correct=True, used_hint=False)
    assert cv.meaning_score > 0
    assert cv.spelling_score == 0
    assert cv.reverse_score == 0
    assert cv.context_score == 0


def test_first_learn_scores_nothing():
    cv = make_cv()
    mastery.update(cv, QuestionType.FIRST_LEARN, correct=True, used_hint=False)
    assert mastery.snapshot(cv) == {
        "meaning_score": 0.0,
        "reverse_score": 0.0,
        "spelling_score": 0.0,
        "context_score": 0.0,
    }


def test_hinted_success_is_worth_less_than_a_clean_one():
    clean, hinted = make_cv(), make_cv()
    mastery.update(clean, QuestionType.T4_SPELL, correct=True, used_hint=False)
    mastery.update(hinted, QuestionType.T4_SPELL, correct=True, used_hint=True)
    assert clean.spelling_score > hinted.spelling_score


def test_wrong_answer_pulls_the_score_back():
    cv = make_cv(meaning_score=0.8)
    mastery.update(cv, QuestionType.T1_EN_TO_ZH, correct=False, used_hint=False)
    assert cv.meaning_score == pytest.approx(0.4)


# --------------------------------------------------------------------------
# Routing (section 24)
# --------------------------------------------------------------------------
def test_brand_new_item_gets_the_introduction_card():
    assert q.choose_question_type(make_cv(review_count=0), has_example=True) is QuestionType.FIRST_LEARN


@pytest.mark.parametrize(
    ("scores", "expected"),
    [
        ({}, QuestionType.T1_EN_TO_ZH),
        ({"meaning_score": 0.9}, QuestionType.T2_ZH_TO_EN),
        ({"meaning_score": 0.9, "reverse_score": 0.9}, QuestionType.T3_CLOZE),
        (
            {"meaning_score": 0.9, "reverse_score": 0.9, "spelling_score": 0.65},
            QuestionType.T4_SPELL,
        ),
        (
            {"meaning_score": 0.9, "reverse_score": 0.9, "spelling_score": 0.9},
            QuestionType.T5_SENTENCE,
        ),
    ],
)
def test_progression_follows_the_spec_ladder(scores, expected):
    assert q.choose_question_type(make_cv(**scores), has_example=True) is expected


def test_context_question_needs_an_original_sentence():
    cv = make_cv(meaning_score=0.9, reverse_score=0.9, spelling_score=0.9)
    assert q.choose_question_type(cv, has_example=False) is not QuestionType.T5_SENTENCE


def test_two_failures_step_the_difficulty_down():
    """Section 24: don't ask the same wall twice."""
    cv = make_cv(meaning_score=0.9, reverse_score=0.9, spelling_score=0.65, consecutive_wrong=2)
    assert q.choose_question_type(cv, has_example=True) is QuestionType.T3_CLOZE


# --------------------------------------------------------------------------
# Question construction (sections 18-23)
# --------------------------------------------------------------------------
def word_ctx(**kw) -> QuestionContext:
    return QuestionContext(
        child_vocabulary=make_cv(**kw.pop("cv", {})),
        lemma="forest",
        vocab_type=VocabType.WORD,
        meaning="森林",
        phonetic="/ˈfɒrɪst/",
        examples=[
            Example(
                sentence_id="s1",
                sentence="The little fox walks into the forest.",
                surface_form="forest",
                start_offset=29,
                end_offset=35,
            )
        ],
        **kw,
    )


def phrase_ctx() -> QuestionContext:
    return QuestionContext(
        child_vocabulary=make_cv(),
        lemma="look for",
        vocab_type=VocabType.PHRASE,
        meaning="寻找",
        examples=[
            Example(
                sentence_id="s2",
                sentence="The fox is looking for food.",
                surface_form="looking for",
                start_offset=11,
                end_offset=22,
            )
        ],
    )


def test_t1_offers_four_options_and_hides_the_answer():
    question = q.build(word_ctx(), QuestionType.T1_EN_TO_ZH, rng=random.Random(1))
    assert len(question.options) == 4
    assert question.answer in question.options
    assert question.public_dict()["meaning"] is None  # would give it away


def test_t2_distractors_are_confusable_not_absurd():
    """Section 19 -- the spec's own example surrounds forest with f-words."""
    question = q.build(word_ctx(), QuestionType.T2_ZH_TO_EN, rng=random.Random(1))
    others = [o for o in question.options if o != "forest"]
    assert len(others) == 3
    assert sum(o.startswith("f") for o in others) >= 2


def test_t3_word_cloze_keeps_the_first_letter():
    question = q.build(word_ctx(), QuestionType.T3_CLOZE, rng=random.Random(2))
    masked = question.prompt["masked"]
    assert masked[0] == "f"
    assert any(ch is None for ch in masked)
    assert question.answer == "forest"
    assert set(question.prompt["letter_bank"]) >= {c for c in "forest" if c not in masked}


def test_t3_phrase_cloze_hides_the_preposition():
    """Section 20: 寻找 -> look ____ , answer 'for'."""
    question = q.build(phrase_ctx(), QuestionType.T3_CLOZE, rng=random.Random(2))
    assert question.answer == "for"
    assert question.prompt["template"] == "look ____"


def test_cloze_widens_as_the_child_improves():
    beginner = q.build(word_ctx(cv={"spelling_score": 0.0}), QuestionType.T3_CLOZE, rng=random.Random(5))
    advanced = q.build(word_ctx(cv={"spelling_score": 1.0}), QuestionType.T3_CLOZE, rng=random.Random(5))
    hidden = lambda question: sum(1 for c in question.prompt["masked"] if c is None)  # noqa: E731
    assert hidden(advanced) > hidden(beginner)


def test_hints_reveal_one_letter_at_a_time():
    """Section 22: ______ -> f _ _ _ _ _ -> f o _ _ _ _."""
    question = q.build(word_ctx(), QuestionType.T4_SPELL, rng=random.Random(1))
    assert question.hints[:2] == ["f _ _ _ _ _", "f o _ _ _ _"]


def test_t5_blanks_the_original_sentence():
    question = q.build(phrase_ctx(), QuestionType.T5_SENTENCE, rng=random.Random(3))
    assert question.prompt["sentence"] == "The fox is ______ food."
    # The blank hides the inflected form, so that is what must be answered.
    assert question.answer == "looking for"
    assert "looking for" in question.options


def test_t5_falls_back_when_there_is_no_usable_sentence():
    ctx = word_ctx()
    ctx.examples = []
    question = q.build(ctx, QuestionType.T5_SENTENCE, rng=random.Random(1))
    assert question.question_type is QuestionType.T4_SPELL


def test_grading_ignores_case_and_padding():
    assert q.grade("look for", "  Look   For ")
    assert not q.grade("look for", "look after")
