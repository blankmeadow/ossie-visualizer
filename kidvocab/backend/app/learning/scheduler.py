"""Today's task (spec section 14).

    due reviews first
      -> top up with never-seen items
      -> hard cap at the daily goal

The child is told one number: "今天 20 个". They are never told how it splits
(section 5.1), and if there are 20 or more reviews due, no new item is added
that day -- the backlog is the priority.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..enums import LearnStatus, QuestionType, VocabType
from ..models import (
    Child,
    ChildVocabulary,
    Sentence,
    StudyDay,
    VocabularyItem,
    VocabularyOccurrence,
)
from .questions import Example, Question, QuestionContext, build_for

#: How many items later in the round a wrong answer comes back (section 25).
REQUEUE_GAP = 3

#: Show at most this many original sentences anywhere in the UI (section 10.1).
MAX_EXAMPLES_SHOWN = 3


@dataclass
class TodayPlan:
    due: list[ChildVocabulary]
    fresh: list[ChildVocabulary]

    @property
    def items(self) -> list[ChildVocabulary]:
        return self.due + self.fresh

    @property
    def total(self) -> int:
        return len(self.items)


def plan_today(db: Session, child: Child, *, now: datetime | None = None) -> TodayPlan:
    now = now or datetime.now(UTC)
    goal = max(1, child.daily_goal or settings.default_daily_goal)

    due = list(
        db.scalars(
            select(ChildVocabulary)
            .where(
                ChildVocabulary.child_id == child.id,
                ChildVocabulary.next_review_at.is_not(None),
                ChildVocabulary.next_review_at <= now,
            )
            .order_by(ChildVocabulary.next_review_at)
            .limit(goal)
        )
    )

    remaining = goal - len(due)
    fresh: list[ChildVocabulary] = []
    if remaining > 0:
        fresh = list(
            db.scalars(
                select(ChildVocabulary)
                .where(
                    ChildVocabulary.child_id == child.id,
                    ChildVocabulary.status == LearnStatus.NEW,
                )
                .order_by(ChildVocabulary.created_at)
                .limit(remaining)
            )
        )
    return TodayPlan(due=due, fresh=fresh)


def estimate_minutes(count: int) -> int:
    if count <= 0:
        return 0
    return max(1, round(count * settings.seconds_per_item_estimate / 60))


# ---------------------------------------------------------------------------
# Session assembly
# ---------------------------------------------------------------------------
def load_examples(db: Session, child_id: str, item_id: str, limit: int = MAX_EXAMPLES_SHOWN) -> list[Example]:
    """Original sentences only -- never AI-generated filler (section 10.1)."""
    rows = db.execute(
        select(VocabularyOccurrence, Sentence)
        .join(Sentence, Sentence.id == VocabularyOccurrence.sentence_id)
        .where(
            VocabularyOccurrence.child_id == child_id,
            VocabularyOccurrence.vocabulary_item_id == item_id,
        )
        .order_by(VocabularyOccurrence.created_at)
    ).all()

    examples: list[Example] = []
    seen: set[str] = set()
    for occurrence, sentence in rows:
        key = sentence.text.lower()
        if key in seen:
            continue
        seen.add(key)
        examples.append(
            Example(
                sentence_id=sentence.id,
                sentence=sentence.text,
                surface_form=occurrence.surface_form,
                start_offset=occurrence.start_offset,
                end_offset=occurrence.end_offset,
            )
        )
        if len(examples) >= limit:
            break
    return examples


def library_pool(db: Session, child_id: str, exclude_item_id: str, limit: int = 60) -> list[tuple[str, str]]:
    rows = db.execute(
        select(VocabularyItem.lemma, VocabularyItem.meaning)
        .join(ChildVocabulary, ChildVocabulary.vocabulary_item_id == VocabularyItem.id)
        .where(
            ChildVocabulary.child_id == child_id,
            ChildVocabulary.vocabulary_item_id != exclude_item_id,
            VocabularyItem.meaning != "",
        )
        .limit(limit)
    ).all()
    return [(lemma, meaning) for lemma, meaning in rows]


def build_context(db: Session, child: Child, cv: ChildVocabulary) -> QuestionContext:
    item = cv.item
    return QuestionContext(
        child_vocabulary=cv,
        lemma=item.lemma,
        vocab_type=VocabType(item.type),
        meaning=item.meaning,
        phonetic=item.phonetic,
        audio_url=item.audio_url,
        examples=load_examples(db, child.id, item.id),
        library=library_pool(db, child.id, item.id),
    )


def build_session(
    db: Session, child: Child, plan: TodayPlan, *, rng: random.Random | None = None
) -> list[Question]:
    rng = rng or random.Random()
    questions: list[Question] = []
    for cv in plan.items:
        ctx = build_context(db, child, cv)
        questions.append(build_for(ctx, rng=rng))
    return questions


def build_question_for(
    db: Session, child: Child, cv: ChildVocabulary, *, rng: random.Random | None = None,
    question_type: QuestionType | None = None,
) -> Question:
    from .questions import build

    ctx = build_context(db, child, cv)
    if question_type is not None:
        return build(ctx, question_type, rng=rng or random.Random())
    return build_for(ctx, rng=rng)


# ---------------------------------------------------------------------------
# Streak + daily record (section 31)
# ---------------------------------------------------------------------------
def get_or_create_day(db: Session, child_id: str, day: date | None = None) -> StudyDay:
    day = day or datetime.now(UTC).date()
    row = db.scalar(select(StudyDay).where(StudyDay.child_id == child_id, StudyDay.day == day))
    if row is None:
        row = StudyDay(child_id=child_id, day=day)
        db.add(row)
        db.flush()
    return row


def current_streak(db: Session, child_id: str, today: date | None = None) -> int:
    """Consecutive completed days ending today (or yesterday, so the streak is
    not shown as broken before the child has studied today)."""
    today = today or datetime.now(UTC).date()
    days = set(
        db.scalars(
            select(StudyDay.day).where(StudyDay.child_id == child_id, StudyDay.completed.is_(True))
        )
    )
    if not days:
        return 0
    from datetime import timedelta

    cursor = today if today in days else today - timedelta(days=1)
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def days_completed_this_week(db: Session, child_id: str, today: date | None = None) -> int:
    from datetime import timedelta

    today = today or datetime.now(UTC).date()
    monday = today - timedelta(days=today.weekday())
    return int(
        db.scalar(
            select(func.count(StudyDay.id)).where(
                StudyDay.child_id == child_id,
                StudyDay.completed.is_(True),
                StudyDay.day >= monday,
            )
        )
        or 0
    )
