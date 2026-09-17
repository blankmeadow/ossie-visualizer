"""Spaced repetition -- "when do we test this again?" (spec sections 27 / 28).

Kept deliberately naive: a fixed ladder of intervals. The point of the MVP is to
accumulate honest ReviewLog data; a real memory model (FSRS or our own) is a
V1.1 job and will be trained on exactly those rows.

Nothing in here is ever shown to a user. The app says "自动安排复习" and nothing
more (section 27).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from ..config import settings
from ..enums import LearnStatus
from ..models import ChildVocabulary

#: Level at and above which an item is considered stable enough to call mastered.
MASTERED_LEVEL = 5


@dataclass(frozen=True)
class SrsUpdate:
    srs_level: int
    next_review_at: datetime
    status: LearnStatus


def _interval_days(level: int) -> int:
    ladder = settings.srs_intervals_days
    return ladder[min(max(level, 0), len(ladder) - 1)]


def next_state(
    *, srs_level: int, correct: bool, used_hint: bool, now: datetime | None = None
) -> SrsUpdate:
    """Advance (or pull back) the schedule for one answer.

    * correct, unaided -> one step up the ladder
    * correct, but only with a hint -> hold position; the child has not shown
      recall yet, so the interval must not grow (section 22)
    * wrong -> two steps back, floored at same-day
    """
    now = now or datetime.now(UTC)

    if not correct:
        level = max(0, srs_level - 2)
    elif used_hint:
        level = srs_level
    else:
        level = min(srs_level + 1, len(settings.srs_intervals_days) - 1)

    days = _interval_days(level)
    if days == 0:
        # Same-day items come back later in this round, not tomorrow.
        next_review = now + timedelta(minutes=10)
    else:
        next_review = now + timedelta(days=days)

    if level >= MASTERED_LEVEL:
        status = LearnStatus.MASTERED
    elif level >= 2:
        status = LearnStatus.REVIEWING
    else:
        status = LearnStatus.LEARNING

    return SrsUpdate(srs_level=level, next_review_at=next_review, status=status)


def apply(cv: ChildVocabulary, *, correct: bool, used_hint: bool, now: datetime | None = None) -> None:
    now = now or datetime.now(UTC)
    update = next_state(srs_level=cv.srs_level, correct=correct, used_hint=used_hint, now=now)
    cv.srs_level = update.srs_level
    cv.next_review_at = update.next_review_at
    cv.last_review_at = now
    cv.status = update.status
    cv.review_count += 1
    if correct:
        cv.correct_count += 1
        cv.consecutive_wrong = 0
    else:
        cv.wrong_count += 1
        cv.consecutive_wrong += 1


def schedule_first_learn(cv: ChildVocabulary, now: datetime | None = None) -> None:
    """After the introduction card (section 15): due again inside the same round."""
    now = now or datetime.now(UTC)
    cv.status = LearnStatus.LEARNING
    cv.last_review_at = now
    cv.next_review_at = now + timedelta(minutes=10)
    cv.review_count += 1
