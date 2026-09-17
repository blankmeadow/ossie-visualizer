"""The child's path: 今天 -> 开始 -> 连续答题 -> 完成 (spec sections 5, 14-29).

Grading is server-side. The client posts an answer and gets back everything the
feedback frame needs -- correctness, the right answer, and (only when wrong) the
original sentence -- so the auto-advance rhythm in section 24A never waits on a
second request.
"""
from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_child, track
from ..enums import EventName, QuestionType
from ..learning import mastery, questions as q, scheduler, srs
from ..models import Child, ChildVocabulary, ReviewLog
from ..schemas import (
    CompleteOut,
    EventIn,
    QuestionOut,
    ReviewIn,
    ReviewOut,
    SessionOut,
    TodayOut,
)

router = APIRouter(tags=["learning"])

#: How many extra appearances one item may earn in a single day. Section 25
#: wants a wrong item to come back, but a child who is stuck on one word must
#: not be trapped in a round that never ends.
MAX_REQUEUES_PER_DAY = 2


@router.get("/today", response_model=TodayOut)
def today(child: Child = Depends(get_current_child), db: Session = Depends(get_db)) -> TodayOut:
    plan = scheduler.plan_today(db, child)
    day = scheduler.get_or_create_day(db, child.id)
    has_content = (
        db.scalar(
            select(func.count(ChildVocabulary.id)).where(ChildVocabulary.child_id == child.id)
        )
        or 0
    ) > 0
    return TodayOut(
        total=plan.total,
        estimated_minutes=scheduler.estimate_minutes(plan.total),
        streak_days=scheduler.current_streak(db, child.id),
        completed_today=day.completed,
        answered_today=day.answered_count,
        has_content=has_content,
    )


@router.get("/today/session", response_model=SessionOut)
def start_session(
    child: Child = Depends(get_current_child), db: Session = Depends(get_db)
) -> SessionOut:
    plan = scheduler.plan_today(db, child)
    if plan.total == 0:
        return SessionOut(session_id=uuid.uuid4().hex, total=0, questions=[])

    rng = random.Random()
    built = scheduler.build_session(db, child, plan, rng=rng)

    day = scheduler.get_or_create_day(db, child.id)
    day.planned_count = plan.total
    db.flush()

    return SessionOut(
        session_id=uuid.uuid4().hex,
        total=len(built),
        questions=[QuestionOut(**question.public_dict()) for question in built],
    )


@router.post("/reviews", response_model=ReviewOut)
def submit_review(
    body: ReviewIn,
    child: Child = Depends(get_current_child),
    db: Session = Depends(get_db),
) -> ReviewOut:
    cv = db.get(ChildVocabulary, body.child_vocabulary_id)
    if cv is None or cv.child_id != child.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "item not found")

    try:
        question_type = QuestionType(body.question_type)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "unknown question type") from exc

    now = datetime.now(UTC)
    item = cv.item
    examples = scheduler.load_examples(db, child.id, item.id)
    used_hint = body.hint_count > 0

    if question_type is QuestionType.FIRST_LEARN:
        # Section 15: an introduction, never graded.
        correct, correct_answer = True, item.lemma
        srs.schedule_first_learn(cv, now)
    else:
        correct_answer = _expected_answer(question_type, item, body.question_payload, examples)
        correct = q.grade(correct_answer, body.answer)
        mastery.update(cv, question_type, correct=correct, used_hint=used_hint)
        srs.apply(cv, correct=correct, used_hint=used_hint, now=now)

    db.add(
        ReviewLog(
            child_vocabulary_id=cv.id,
            question_type=question_type.value,
            question_payload=body.question_payload or {},
            answer=body.answer,
            correct=correct,
            hint_count=body.hint_count,
            response_time_ms=body.response_time_ms,
            reviewed_at=now,
        )
    )

    day = scheduler.get_or_create_day(db, child.id)
    day.answered_count += 1
    day.duration_ms += body.response_time_ms
    if correct:
        day.correct_count += 1

    track(db, child.id, EventName.ANSWER_SUBMITTED, type=question_type.value, correct=correct)
    if used_hint:
        track(db, child.id, EventName.HINT_USED, type=question_type.value, count=body.hint_count)
    track(
        db,
        child.id,
        EventName.ANSWER_CORRECT if correct else EventName.ANSWER_WRONG,
        lemma=item.lemma,
    )

    # Two reasons an item comes back later in the same round, both handled by
    # the same mechanism and neither of them the child's job to manage:
    #   * section 15 -- a newly introduced item is not tested *immediately*,
    #     but it is tested before the round ends
    #   * section 25 -- a wrong answer is re-asked, with no error notebook
    requeue = question_type is QuestionType.FIRST_LEARN or not correct
    if requeue and _requeues_today(db, cv.id, now) >= MAX_REQUEUES_PER_DAY:
        # Enough for today. The schedule will bring it back tomorrow instead of
        # grinding the same item through the rest of the round.
        requeue = False

    requeue_question = None
    if requeue:
        follow_up = scheduler.build_question_for(db, child, cv)
        requeue_question = QuestionOut(**follow_up.public_dict())

    db.flush()
    return ReviewOut(
        correct=correct,
        correct_answer=correct_answer,
        lemma=item.lemma,
        meaning=item.meaning,
        phonetic=item.phonetic,
        audio_url=item.audio_url,
        example=(
            {
                "sentence": examples[0].sentence,
                "surface_form": examples[0].surface_form,
                "start_offset": examples[0].start_offset,
                "end_offset": examples[0].end_offset,
            }
            if examples and not correct
            else None
        ),
        requeue=requeue,
        requeue_question=requeue_question,
    )


def _requeues_today(db: Session, child_vocabulary_id: str, now: datetime) -> int:
    """Appearances already earned beyond the item's one scheduled slot."""
    start = datetime(now.year, now.month, now.day, tzinfo=UTC)
    seen = int(
        db.scalar(
            select(func.count(ReviewLog.id)).where(
                ReviewLog.child_vocabulary_id == child_vocabulary_id,
                ReviewLog.reviewed_at >= start.replace(tzinfo=None),
            )
        )
        or 0
    )
    return max(0, seen - 1)


def _expected_answer(
    question_type: QuestionType, item, payload: dict, examples: list[q.Example]
) -> str:
    """Re-derive the answer server-side rather than trusting the client.

    Only the *shape* of the question comes from the payload (which sentence was
    blanked, which token was hidden); the answer itself is recomputed.
    """
    if question_type is QuestionType.T1_EN_TO_ZH:
        return item.meaning
    if question_type is QuestionType.T2_ZH_TO_EN:
        return item.lemma
    if question_type is QuestionType.T4_SPELL:
        return item.lemma
    if question_type is QuestionType.T3_CLOZE:
        tokens = item.lemma.split()
        if len(tokens) > 1:
            index = payload.get("blank_index")
            if not isinstance(index, int) or not 0 <= index < len(tokens):
                index = 0
            return tokens[index]
        return item.lemma
    if question_type is QuestionType.T5_SENTENCE:
        sentence = (payload or {}).get("sentence")
        for example in examples:
            blanked = (
                example.sentence[: example.start_offset]
                + "______"
                + example.sentence[example.end_offset :]
            )
            if blanked == sentence:
                return example.surface_form
        return examples[0].surface_form if examples else item.lemma
    return item.lemma


@router.post("/today/complete", response_model=CompleteOut)
def complete_today(
    child: Child = Depends(get_current_child), db: Session = Depends(get_db)
) -> CompleteOut:
    day = scheduler.get_or_create_day(db, child.id)
    day.completed = True
    db.flush()

    accuracy = round(day.correct_count / day.answered_count * 100) if day.answered_count else 0
    track(
        db,
        child.id,
        EventName.SESSION_COMPLETED,
        answered=day.answered_count,
        accuracy=accuracy,
    )
    return CompleteOut(
        completed_count=day.answered_count,
        correct_count=day.correct_count,
        accuracy=accuracy,
        duration_minutes=max(1, round(day.duration_ms / 60000)) if day.duration_ms else 0,
        streak_days=scheduler.current_streak(db, child.id),
    )


@router.post("/events", status_code=204, response_class=Response)
def record_event(
    body: EventIn,
    child: Child = Depends(get_current_child),
    db: Session = Depends(get_db),
) -> Response:
    """Section 24A.8 / 49 -- client-side funnel events."""
    track(db, child.id, body.name, **body.payload)
    return Response(status_code=204)
